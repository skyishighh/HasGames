// Main gameplay scene. The same scene runs on host and guests:
//  - host:  owns Arcade Physics bodies, applies everyone's input, broadcasts snapshots
//  - guest: has no physics; only sends input and draws the latest snapshot
import {
  WIDTH, HEIGHT, GROUND_Y, GRAVITY, MOVE_SPEED, JUMP_SPEED, PLAYER_W, PLAYER_H, SNAPSHOT_HZ,
} from '../config.js';
import { PlayerView } from '../objects/PlayerView.js';

const EMPTY_INPUT = { left: false, right: false, jump: false };

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
  }

  create() {
    this.#createBackground();
    this.ground = this.add.rectangle(WIDTH / 2, GROUND_Y + (HEIGHT - GROUND_Y) / 2, WIDTH, HEIGHT - GROUND_Y, 0x050505);

    const kb = this.input.keyboard;
    this.keys = kb.addKeys('A,D,W,SPACE');
    this.cursors = kb.createCursorKeys();

    if (this.role === 'host') {
      this.physics.world.gravity.y = GRAVITY;
      this.physics.add.existing(this.ground, true); // static body
      this.addPlayer(this.myId, this.myName);
    }
    this.onReady?.(this);
  }

  #createBackground() {
    const tex = this.textures.createCanvas('bg', WIDTH, HEIGHT);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 50, WIDTH / 2, HEIGHT / 2, WIDTH * 0.7);
    g.addColorStop(0, '#9a9a94');
    g.addColorStop(1, '#1c1c1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    tex.refresh();
    this.add.image(0, 0, 'bg').setOrigin(0);
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
    const slot = this.players.size;
    const hitbox = this.add.rectangle(120 + slot * 50 + PLAYER_W / 2, GROUND_Y - PLAYER_H / 2, PLAYER_W, PLAYER_H)
      .setVisible(false);
    this.physics.add.existing(hitbox);
    hitbox.body.setCollideWorldBounds(true);
    this.physics.add.collider(hitbox, this.ground);
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
  applySnapshot(list) {
    if (!Array.isArray(list)) return;
    this.#syncViews(list);
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

    const snap = this.#snapshot();
    this.#syncViews(snap); // host draws its own simulation directly (every frame)

    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 1 / SNAPSHOT_HZ) {
      this.snapshotTimer = 0;
      this.net.broadcast({ t: 'state', players: snap });
    }
  }

  #snapshot() {
    return [...this.players].map(([id, p]) =>
      ({ id, name: p.name, x: Math.round(p.hitbox.x), y: Math.round(p.hitbox.y), facing: p.facing }));
  }

  #syncViews(list) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      let view = this.views.get(s.id);
      if (!view) {
        view = new PlayerView(this, String(s.name).slice(0, 12), s.id === this.myId);
        this.views.set(s.id, view);
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
    this.onPlayers?.(this.#snapshotNames());
  }

  #snapshotNames() { return [...this.views.values()].map((v) => ({ name: v.label.text })); }
}
