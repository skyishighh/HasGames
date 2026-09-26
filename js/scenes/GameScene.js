// Main gameplay scene. The same scene runs on host and guests:
//  - host:  owns Arcade Physics, runs every PlayerSim (movement + role abilities)
//           and the level rules, then broadcasts snapshots
//  - guest: has no physics; sends input and draws interpolated snapshots
import { WIDTH, HEIGHT, GRAVITY, SNAPSHOT_HZ } from '../config.js';
import { ROLE_ORDER, EMPTY_INPUT } from '../roles.js';
import { PlayerView } from '../objects/PlayerView.js';
import { PlayerSim } from '../player/PlayerSim.js';
import { LocalInput } from '../player/input.js';
import { Level } from '../world/Level.js';
import { SnapshotBuffer } from '../snapshot-buffer.js';
import gym from '../levels/gym.js';

const hit = Phaser.Geom.Intersects.RectangleToRectangle;
/** Arcade may pass collider arguments in either order; return [player, other]. */
const split = (a, b) => (a.sim ? [a, b] : [b, a]);

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
    this.sims = new Map();    // host only: id -> PlayerSim
    this.snapshotTimer = 0;
    this.lastSentInput = '';
    this.buffer = new SnapshotBuffer(); // guest only
    this.pendingFx = [];      // host: effects to broadcast with the next snapshot
    // Developer mode: each client controls its own character or one of its dummies.
    this.control = new Map(); // host only: ownerId -> controlled sim id
    this.localControl = data.myId; // which character this client's camera follows
  }

  create() {
    const isHost = this.role === 'host';
    this.levelData = gym;
    this.#createBackground();
    this.level = new Level(this, this.levelData, isHost);
    this.cameras.main.setBounds(0, 0, this.levelData.width, this.levelData.height);
    this.beamGfx = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.localInput = new LocalInput(this);

    if (isHost) {
      this.physics.world.gravity.y = GRAVITY;
      this.physics.world.setBounds(0, 0, this.levelData.width, this.levelData.height + 200);
      this.physics.world.setBoundsCollision(true, true, true, false); // open bottom: pits
      this.playerGroup = this.physics.add.group();
      this.#createColliders();
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
    this.add.image(0, 0, 'bg').setOrigin(0).setScrollFactor(0).setDepth(-10);
  }

  // ---------------------------------------------------------------- host: physics wiring
  #createColliders() {
    const L = this.level, P = this.playerGroup, phys = this.physics;
    const movables = [...L.blocks, ...L.crates].map((o) => o.view);
    const statics = [L.solids, ...L.gates.map((g) => g.body), ...L.cracked.map((c) => c.view),
      ...L.fragile.map((f) => f.view), ...L.phantom.map((p) => p.view), ...L.crushers.map((c) => c.view)];

    for (const s of statics) phys.add.collider(P, s, null, (a, b) => this.#onPlayerHitsStatic(...split(a, b)));
    // One-way platforms: only from above, and not while dropping through.
    for (const o of L.oneWay) phys.add.collider(P, o.view, null, (a, b) => {
      const [pl] = split(a, b);
      return pl.sim.dropT <= 0 && pl.body.velocity.y >= 0 && pl.body.bottom <= o.view.body.top + 10;
    });
    // Heavy blocks move only for the Warden; crates for everyone.
    for (const b of L.blocks) phys.add.collider(P, b.view, null, (a, c) => {
      const [pl, blk] = split(a, c);
      blk.body.pushable = pl.sim.role === 'warden';
      return true;
    });
    for (const c of L.crates) phys.add.collider(P, c.view);
    // Players stand on each other's heads (and on a planted Anchor), but walk through each other sideways.
    phys.add.collider(P, P, null, (a, b) => this.#stackRule(a, b));
    for (const m of movables) {
      for (const s of statics) phys.add.collider(m, s);
      for (const o of movables) if (o !== m) phys.add.collider(m, o);
    }
  }

  #onPlayerHitsStatic(pl, obj) {
    const frag = this.level.fragile.find((f) => f.view === obj);
    // The Warden's weight breaks fragile floors a moment after stepping on them.
    if (frag && pl.sim.role === 'warden' && !frag.breakAt && pl.body.bottom <= obj.body.top + 6) frag.breakAt = this.time.now + 250;
    return true;
  }

  #stackRule(a, b) {
    const [sa, sb] = [a.sim, b.sim];
    if (sa.ride || sb.ride) return false;
    const [top, bottom] = a.body.center.y < b.body.center.y ? [a, b] : [b, a];
    if (bottom.sim.planted) return true;                        // a planted Anchor is solid
    const landing = top.body.bottom <= bottom.body.top + 8 && top.body.velocity.y >= bottom.body.velocity.y;
    if (landing) bottom.body.pushable = false;                  // don't push the lower player into the floor
    return landing;
  }

  // ---------------------------------------------------------------- host: players
  addPlayer(id, name, near = null) {
    const i = this.sims.size;
    const role = ROLE_ORDER[i % ROLE_ORDER.length];              // temporary until lobby role assignment
    const x = near ? near.x + 30 : this.levelData.spawn.x + i * this.levelData.spawn.spacing;
    const sim = new PlayerSim(this, this.playerGroup, id, name, role, x, near ? near.feet - 2 : 440);
    if (near) sim.checkpoint = near.checkpoint;
    this.sims.set(id, sim);
  }

  removePlayer(id) {
    for (const simId of [id, ...this.#dummiesOf(id)]) {
      this.sims.get(simId)?.destroy();
      this.sims.delete(simId);
      this.#removeView(simId);
    }
    this.control.delete(id);
  }

  /** Input from a client goes to whichever character that client currently controls. */
  setInput(ownerId, input) { this.sims.get(this.#controlled(ownerId))?.setInput(input); }

  /** Developer role switch (keys 1–4) for the controlled character. */
  setRole(ownerId, role) { this.sims.get(this.#controlled(ownerId))?.setRole(role); }

  // ---------------------------------------------------------------- host: developer dummies
  #controlled(ownerId) { return this.control.get(ownerId) ?? ownerId; }
  #dummiesOf(ownerId) { return [...this.sims.keys()].filter((id) => id.startsWith(`${ownerId}#dummy`)); }

  /** Key 0: spawn an idle dummy teammate next to the owner's controlled character (max 3). */
  devSpawn(ownerId) {
    const dummies = this.#dummiesOf(ownerId);
    if (dummies.length >= 3 || this.sims.size >= 8) return;
    let n = 1;
    while (this.sims.has(`${ownerId}#dummy${n}`)) n++;
    this.addPlayer(`${ownerId}#dummy${n}`, `Dummy ${n}`, this.sims.get(this.#controlled(ownerId)));
  }

  /** Tab: move control to the owner's next character. Returns the newly controlled id. */
  devCycle(ownerId) {
    const chain = [ownerId, ...this.#dummiesOf(ownerId)];
    const current = this.#controlled(ownerId);
    const next = chain[(chain.indexOf(current) + 1) % chain.length];
    this.sims.get(current)?.setInput({ ...EMPTY_INPUT });   // the one we leave stands still
    this.control.set(ownerId, next);
    return next;
  }

  /** Which character this client's camera follows. */
  setLocalControl(id) {
    this.localControl = id;
    const view = this.views.get(id);
    if (view) this.cameras.main.startFollow(view, false, 0.1, 0.1);
  }

  // ---------------------------------------------------------------- guest
  applySnapshot(msg) {
    if (!Array.isArray(msg.players)) return;
    this.buffer.push(msg.ts, msg.players, performance.now(), msg.level?.ents);
    this.level.applyState(msg.level);
    for (const f of msg.fx ?? []) this.#playFx(f);
  }

  // ---------------------------------------------------------------- loop
  update(time, deltaMs) {
    const input = this.localInput.read();
    const dev = this.localInput.devAction();

    if (this.role === 'host') {
      if (dev?.role !== undefined) this.setRole(this.myId, ROLE_ORDER[dev.role]);
      if (dev?.spawn) this.devSpawn(this.myId);
      if (dev?.cycle) this.setLocalControl(this.devCycle(this.myId));
      this.setInput(this.myId, input);
      this.#stepHost(time / 1000, deltaMs / 1000);
    } else {
      if (dev?.role !== undefined) this.net.send({ t: 'role', role: ROLE_ORDER[dev.role] });
      if (dev?.spawn) this.net.send({ t: 'dev', action: 'spawn' });
      if (dev?.cycle) this.net.send({ t: 'dev', action: 'cycle' });
      const key = JSON.stringify(input);
      if (key !== this.lastSentInput) { this.net.send({ t: 'input', input }); this.lastSentInput = key; }
      const frame = this.buffer.sampleAll();
      if (frame) { this.#syncViews(frame.players); this.level.applyEntities(frame.ents); }
    }
    this.level.draw(time);
    this.#drawBeams();
  }

  #stepHost(now, dt) {
    const players = [...this.sims.values()];
    const fx = (type, x, y) => { const f = { type, x: Math.round(x), y: Math.round(y) }; this.pendingFx.push(f); this.#playFx(f); };
    const ctx = { level: this.level, players, time: now, dt, fx };

    for (const p of players) p.step(ctx);
    this.#stepWorld(ctx);

    for (const p of players) {
      // Checkpoints + falling into pits.
      for (const cx of this.levelData.checkpoints) if (p.x >= cx && cx > p.checkpoint) p.checkpoint = cx;
      if (p.feet > this.levelData.height + 60) p.respawn();
    }

    const snap = players.map((p) => p.snapshot());
    this.#syncViews(snap);
    const levelState = this.level.getState();
    this.level.applyState(levelState);

    this.snapshotTimer += dt;
    if (this.snapshotTimer >= 1 / SNAPSHOT_HZ) {
      this.snapshotTimer = Math.min(this.snapshotTimer - 1 / SNAPSHOT_HZ, 1 / SNAPSHOT_HZ);
      const net = snap.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) })); // round only on the wire
      this.net.broadcast({ t: 'state', ts: performance.now(), players: net, level: levelState, fx: this.pendingFx });
      this.pendingFx = [];
    }
  }

  /** Host-only level rules: plates, nodes, gates, phantom platforms, crushers, wind, chain, breakables. */
  #stepWorld({ level: L, players, time, dt }) {
    // Heavy plates: only a (standing or planted) Anchor presses them.
    L.plates.forEach((pl, i) => {
      const zone = new Phaser.Geom.Rectangle(pl.data.x, pl.data.y - 6, pl.data.w, 14);
      L.setPlatePressed(i, players.some((p) => p.role === 'anchor' && hit(p.bounds, zone)));
    });
    for (const n of L.nodes) n.lit = n.litUntil > time;
    for (const p of L.phantom) {
      p.lit = p.litUntil > time;
      p.view.body.enable = p.lit;
    }
    // Gates open while their plate is pressed or their node is lit. A gate never closes on a player.
    L.gates.forEach((g, i) => {
      const plate = L.plates.find((p) => p.data.opens === g.data.id);
      const node = L.nodes.find((n) => n.data.opens === g.data.id);
      const wantOpen = !!(plate?.pressed || node?.lit);
      const blocked = players.some((p) => hit(p.bounds, new Phaser.Geom.Rectangle(g.data.x, g.data.y, g.data.w, g.data.h)));
      L.setGateOpen(i, wantOpen || (g.open && blocked));
    });

    // Crushers: cycle down/up; a bracing Warden holds them up; anyone caught underneath respawns.
    for (const c of L.crushers) {
      c.t = (c.t + dt) % c.data.period;
      const phase = c.t / c.data.period;                          // 0..1
      const down = phase < 0.5 ? Math.min(1, phase * 4) : Math.max(0, 1 - (phase - 0.5) * 4);
      let bottom = c.data.top + c.data.h + down * (460 - c.data.top - c.data.h);
      const brace = players.find((p) => p.bracing && p.x > c.data.x && p.x < c.data.x + c.data.w);
      if (brace) bottom = Math.min(bottom, brace.body.y - 10);
      c.view.y = bottom - c.data.h / 2;
      c.view.body.reset(c.view.x, c.view.y);
      for (const p of players) {
        if (p === brace || p.x < c.data.x || p.x > c.data.x + c.data.w) continue;
        if (bottom > p.body.y + 6 && p.grounded) p.respawn();
      }
    }

    // Wind gusts.
    for (const w of L.wind) {
      w.t = (w.t + dt) % (w.data.on + w.data.off);
      w.active = w.t < w.data.on;
    }

    // Chain lifetime; it breaks if its Anchor un-plants.
    if (L.chain) {
      const owner = this.sims.get(L.chain.owner);
      if (!owner || time > L.chain.until || (!owner.planted && !players.some((p) => p.ride))) L.chain = null;
    }

    // Fragile floors scheduled to break.
    for (const f of L.fragile) if (f.breakAt && !f.broken && this.time.now >= f.breakAt) L.breakObject(f);
  }

  // ---------------------------------------------------------------- views + effects
  #syncViews(list) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      let view = this.views.get(s.id);
      if (!view) {
        const isMe = s.id === this.myId;
        view = new PlayerView(this, String(s.name).slice(0, 12), isMe);
        this.views.set(s.id, view);
        if (s.id === this.localControl) this.cameras.main.startFollow(view, false, 0.1, 0.1);
        this.onPlayers?.(list);
      }
      view.applyState(s);
      view.lastState = s;
    }
    for (const id of [...this.views.keys()]) if (!seen.has(id)) this.#removeView(id);
  }

  #drawBeams() {
    const g = this.beamGfx.clear();
    for (const v of this.views.values()) {
      const s = v.lastState;
      if (!s) continue;
      if (Array.isArray(s.beam)) {
        const [x1, y1, x2, y2] = s.beam;
        g.lineStyle(10, 0xffffff, 0.12).lineBetween(x1, y1, x2, y2);
        g.lineStyle(3, 0xffffff, 0.7).lineBetween(x1, y1, x2, y2);
        g.fillStyle(0xffffff, 0.25).fillCircle(x2, y2, 10);
      }
      if (s.flare) g.fillStyle(0xffffff, 0.12).fillCircle(s.x, s.y - 20, 180);
    }
  }

  #playFx({ type, x, y }) {
    const ring = this.add.circle(x, y, 6).setStrokeStyle(2, 0xffffff, 0.8).setDepth(7);
    const size = { slam: 90, smash: 50, flare: 60, throw: 30, yank: 30 }[type] ?? 30;
    this.tweens.add({ targets: ring, radius: size, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
    if (type === 'slam' || type === 'smash') this.cameras.main.shake(120, 0.004);
  }

  #removeView(id) {
    const view = this.views.get(id);
    if (!view) return;
    view.destroy();
    this.views.delete(id);
    this.onPlayers?.([...this.views.values()].map((v) => ({ name: v.label.text })));
  }
}
