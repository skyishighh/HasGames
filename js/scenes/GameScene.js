// Main gameplay scene. The same scene runs on host and guests:
//  - host:  owns Arcade Physics bodies, applies everyone's input, runs puzzle
//           logic and broadcasts snapshots
//  - guest: has no physics; only sends input and draws interpolated snapshots
import {
  WIDTH, HEIGHT, GRAVITY, MOVE_SPEED, JUMP_SPEED, PLAYER_W, PLAYER_H, SNAPSHOT_HZ,
} from '../config.js';
import { PlayerView } from '../objects/PlayerView.js';
import { Level } from '../world/Level.js';
import level1 from '../levels/level1.js';
import { SnapshotBuffer } from '../snapshot-buffer.js';

const EMPTY_INPUT = { left: false, right: false, jump: false };
const Intersects = Phaser.Geom.Intersects;

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  /** data: { role: 'host'|'guest', net, myId, myName, onPlayers(list), onReady(scene) } */
  init(data) {
    this.role = data.role;
    this.net = data.net;
    this.myId = data.myId;
    this.myName = data.myName;
    this.onPlayers = data.onPlayers;
    this.onReady = data.onReady;
    this.views = new Map();   // id -> PlayerView
    this.players = new Map(); // host only: id -> { name, hitbox, input, facing }
    this.snapshotTimer = 0;
    this.lastSentInput = '';
    this.buffer = new SnapshotBuffer(); // guest only
    this.complete = false;
  }

  create() {
    const isHost = this.role === 'host';
    this.levelData = level1;

    this.#createBackground();
    this.level = new Level(this, this.levelData, isHost);
    this.cameras.main.setBounds(0, 0, this.levelData.width, this.levelData.height);
    this.completeText = this.add.text(WIDTH / 2, HEIGHT / 3, 'Level complete', {
      fontFamily: 'system-ui, sans-serif', fontSize: '36px', color: '#eeeeee',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10).setVisible(false);

    const kb = this.input.keyboard;
    this.keys = kb.addKeys('A,D,W,SPACE');
    this.cursors = kb.createCursorKeys();

    if (isHost) {
      this.physics.world.gravity.y = GRAVITY;
      this.physics.world.setBounds(0, 0, this.levelData.width, this.levelData.height);
      this.addPlayer(this.myId, this.myName);
    }
    this.onReady?.(this);
  }

  /** Fixed backdrop (does not scroll with the camera). */
  #createBackground() {
    const tex = this.textures.createCanvas('bg', WIDTH, HEIGHT);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 50, WIDTH / 2, HEIGHT / 2, WIDTH * 0.7);
    g.addColorStop(0, '#9a9a94');
    g.addColorStop(1, '#1c1c1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    tex.refresh();
    this.add.image(0, 0, 'bg').setOrigin(0).setScrollFactor(0);
  }

  #readLocalInput() {
    const { keys: k, cursors: c } = this;
    return {
      left: k.A.isDown || c.left.isDown,
      right: k.D.isDown || c.right.isDown,
      jump: k.W.isDown || c.up.isDown || k.SPACE.isDown,
    };
  }

  // ---------- Host API (called from net callbacks) ----------
  addPlayer(id, name) {
    const { spawn } = this.levelData;
    const slot = this.players.size;
    const hitbox = this.add.rectangle(spawn.x + slot * spawn.spacing, spawn.y - PLAYER_H / 2, PLAYER_W, PLAYER_H)
      .setVisible(false);
    this.physics.add.existing(hitbox);
    hitbox.body.setCollideWorldBounds(true);
    for (const solid of this.level.colliders()) this.physics.add.collider(hitbox, solid);
    this.players.set(id, { name, hitbox, input: { ...EMPTY_INPUT }, facing: 1 });
  }

  removePlayer(id) {
    this.players.get(id)?.hitbox.destroy();
    this.players.delete(id);
    this.#removeView(id);
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || typeof input !== 'object' || input === null) return;
    p.input = { left: !!input.left, right: !!input.right, jump: !!input.jump }; // never trust network data
  }

  // ---------- Guest API ----------
  applySnapshot(msg) {
    if (!Array.isArray(msg.players)) return;
    this.buffer.push(msg.ts, msg.players);
    this.#applyWorldState(msg);
  }

  // ---------- Loop ----------
  update(_time, deltaMs) {
    const input = this.#readLocalInput();
    if (this.role === 'host') {
      this.setInput(this.myId, input);
      this.#stepHost(deltaMs / 1000);
    } else {
      const key = JSON.stringify(input);
      if (key !== this.lastSentInput) { this.net.send({ t: 'input', input }); this.lastSentInput = key; }
      const players = this.buffer.sample();
      if (players) this.#syncViews(players);
    }
  }

  #stepHost(dt) {
    for (const p of this.players.values()) {
      const body = p.hitbox.body;
      const dir = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      body.setVelocityX(dir * MOVE_SPEED);
      if (dir) p.facing = dir;
      if (p.input.jump && body.blocked.down) body.setVelocityY(-JUMP_SPEED);
    }

    const world = this.#simulatePuzzle();
    const players = this.#snapshotPlayers();
    this.#syncViews(players); // host draws its own simulation directly (every frame)
    this.#applyWorldState(world);

    // Carry leftover time over (instead of resetting to 0) so sends stay evenly spaced.
    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 1 / SNAPSHOT_HZ) {
      this.snapshotTimer = Math.min(this.snapshotTimer - 1 / SNAPSHOT_HZ, 1 / SNAPSHOT_HZ);
      const net = players.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) })); // round only on the wire
      this.net.broadcast({ t: 'state', ts: performance.now(), players: net, ...world });
    }
  }

  /** Host-only puzzle rules. Returns the dynamic world state to broadcast. */
  #simulatePuzzle() {
    const hitboxes = [...this.players.values()].map((p) => p.hitbox.getBounds());
    const touching = (r) => {
      const zone = new Phaser.Geom.Rectangle(r.x, r.y - 4, r.w, r.h + 4); // a bit above so standing counts
      return hitboxes.some((b) => Intersects.RectangleToRectangle(b, zone));
    };

    const plates = this.levelData.plates.map(touching);
    const anyPressed = plates.includes(true);
    // Fairness: a gate never closes on top of a player standing in the doorway.
    const gates = this.level.gates.map((g) => anyPressed || (g.open && touching(g.data)));

    const finish = new Phaser.Geom.Rectangle(this.levelData.finish.x, this.levelData.finish.y,
      this.levelData.finish.w, this.levelData.finish.h);
    const complete = this.complete ||
      (hitboxes.length > 0 && hitboxes.every((b) => Intersects.RectangleToRectangle(b, finish)));

    return { plates, gates, complete };
  }

  #applyWorldState({ plates, gates, complete }) {
    if (Array.isArray(plates)) plates.forEach((v, i) => this.level.setPlatePressed(i, !!v));
    if (Array.isArray(gates)) gates.forEach((v, i) => this.level.setGateOpen(i, !!v));
    if (complete && !this.complete) {
      this.complete = true;
      this.completeText.setVisible(true);
    }
  }

  #snapshotPlayers() {
    return [...this.players].map(([id, p]) =>
      ({ id, name: p.name, x: p.hitbox.x, y: p.hitbox.y, facing: p.facing }));
  }

  #syncViews(list) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      let view = this.views.get(s.id);
      if (!view) {
        const isMe = s.id === this.myId;
        view = new PlayerView(this, String(s.name).slice(0, 12), isMe);
        this.views.set(s.id, view);
        if (isMe) this.cameras.main.startFollow(view, false, 0.1, 0.1); // no pixel snapping: smoother for non-pixel art
        this.onPlayers?.(list);
      }
      view.applyState(s.x, s.y, s.facing === -1 ? -1 : 1);
    }
    for (const id of [...this.views.keys()]) if (!seen.has(id)) this.#removeView(id);
  }

  #removeView(id) {
    const view = this.views.get(id);
    if (!view) return;
    view.destroy();
    this.views.delete(id);
    this.onPlayers?.([...this.views.values()].map((v) => ({ name: v.label.text })));
  }
}
