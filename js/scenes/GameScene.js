// Main gameplay scene. The same scene runs on host and guests:
//  - host:  owns Arcade Physics, runs every PlayerSim (movement + role abilities)
//           and the level rules, then broadcasts snapshots
//  - guest: has no physics; sends input and draws interpolated snapshots
import { WIDTH, HEIGHT, GRAVITY, SNAPSHOT_HZ } from '../config.js';
import { ROLE_ORDER, EMPTY_INPUT, ABILITIES } from '../roles.js';
import { PlayerView } from '../objects/PlayerView.js';
import { PlayerSim } from '../player/PlayerSim.js';
import { LocalInput } from '../player/input.js';
import { Level } from '../world/Level.js';
import { Atmosphere } from '../world/Atmosphere.js';
import { Scripted } from '../world/Scripted.js';
import { SnapshotBuffer } from '../snapshot-buffer.js';
import { enableSubstepping } from '../world/physics-substep.js';
import { preloadBackdrops, Backdrops } from '../art/Backdrops.js';
import gym from '../levels/gym.js';
import awakening from '../levels/awakening.js';

const LEVELS = { gym, awakening };

const hit = Phaser.Geom.Intersects.RectangleToRectangle;
/** Arcade may pass collider arguments in either order; return [player, other]. */
const split = (a, b) => (a.sim ? [a, b] : [b, a]);
/**
 * True if body `a` came from above body `b`: judged by where `a`'s bottom was at the start of
 * this physics step, so fast falls (which overlap deeply in one step) still count as landing.
 */
const startY = (body) => (body.prev ? body.prev.y : body.y);   // static bodies don't move: no prev
const cameFromAbove = (a, b, slack = 4) => startY(a) + a.height <= startY(b) + slack;

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  /** data: { role: 'host'|'guest', net, myId, myName, levelKey, onPlayers(list), onReady(scene) } */
  init(data) {
    this.levelKey = LEVELS[data.levelKey] ? data.levelKey : 'awakening';
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
    this.slowMo = 1;               // dev inspect mode (key 8): 0.5 = half speed
    this.baseZoom = 1;             // normal camera zoom (1.5 in inspect mode)
  }

  preload() {
    preloadBackdrops(this, LEVELS[this.levelKey]);
  }

  create() {
    const isHost = this.role === 'host';
    this.levelData = LEVELS[this.levelKey];
    this.#createBackground();
    this.level = new Level(this, this.levelData, isHost);
    this.atmosphere = new Atmosphere(this, this.level);
    this.backdrops = new Backdrops(this, this.levelData);
    this.scripted = new Scripted(this, this.levelData);
    this.cameras.main.setBounds(0, 0, this.levelData.width, this.levelData.height);
    this.beamGfx = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.localInput = new LocalInput(this);

    if (isHost) {
      this.physics.world.gravity.y = GRAVITY;
      enableSubstepping(this.physics.world, this.sys.events);   // slow frames can't sink through floors
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
    g.addColorStop(0, '#cfcfcb');   // matches style frame sky (~205)
    g.addColorStop(1, '#5c5c58');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    tex.refresh();
    this.bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'bg').setScrollFactor(0).setDepth(-10);
  }

  // ---------------------------------------------------------------- host: physics wiring
  #createColliders() {
    const L = this.level, P = this.playerGroup, phys = this.physics;
    const movables = [...L.blocks, ...L.crates].map((o) => o.view);
    const statics = [L.solids, ...L.gates.map((g) => g.body), ...L.cracked.map((c) => c.view),
      ...L.fragile.map((f) => f.view), ...L.debris.map((d) => d.view), ...L.phantom.map((p) => p.view),
      ...L.crushers.map((c) => c.view)];

    for (const s of statics) phys.add.collider(P, s, null, (a, b) => this.#onPlayerHitsStatic(...split(a, b)));
    // One-way platforms: only from above, and not while dropping through.
    for (const o of L.oneWay) phys.add.collider(P, o.view, null, (a, b) => {
      const [pl] = split(a, b);
      return pl.sim.dropT <= 0 && pl.body.velocity.y >= 0 && cameFromAbove(pl.body, o.view.body);
    });
    // Heavy blocks move only for the Warden; crates for everyone.
    // Heavy blocks: never moved by collision separation; only a Warden walking into a side moves them.
    for (const b of L.blocks) {
      b.view.body.pushable = false;
      phys.add.collider(P, b.view, null, (a, c) => {
        const [pl, blk] = split(a, c);
        const side = !cameFromAbove(pl.body, blk.body);
        const into = Math.sign(pl.body.velocity.x) === Math.sign(blk.body.center.x - pl.body.center.x);
        if (pl.sim.role === 'warden' && pl.sim.has('push') && side && into) {
          blk.body.setVelocityX(pl.body.velocity.x * 0.9);
          blk.pushedUntil = this.time.now + 100;       // no ground friction while being pushed
        }
        return true;
      });
    }
    // Crates are never moved by collision separation (a player landing on a corner could squeeze
    // them through the floor). Instead, anyone walking into a crate's side slides it at walking pace.
    for (const c of L.crates) {
      c.view.body.pushable = false;
      phys.add.collider(P, c.view, null, (a, b) => {
        const [pl, crate] = split(a, b);
        const side = !cameFromAbove(pl.body, crate.body);
        const into = Math.sign(pl.body.velocity.x) === Math.sign(crate.body.center.x - pl.body.center.x);
        if (side && into) crate.body.setVelocityX(pl.body.velocity.x * 0.9);
        return true;
      });
    }
    // Players stand on each other's heads (and on a planted Anchor), but walk through each other sideways.
    phys.add.collider(P, P, null, (a, b) => this.#stackRule(a, b));
    for (const m of movables) {
      for (const s of statics) phys.add.collider(m, s);
      for (const o of movables) if (o !== m) phys.add.collider(m, o);
    }
  }

  #onPlayerHitsStatic(pl, obj) {
    const pb = pl.body, sb = obj.body;
    const isCrusher = this.level.crushers.some((c) => c.view === obj);   // crushers are meant to press down

    // The Warden's weight breaks fragile floors a moment after stepping on them.
    const frag = this.level.fragile.find((f) => f.view === obj);
    if (frag && pl.sim.role === 'warden' && !frag.breakAt && cameFromAbove(pb, sb, 8)) frag.breakAt = this.time.now + 250;

    // Vents (low openings like the fallen pipe): a crouching Scout that has earned 'crawl' passes
    // through them. The Scout's hitbox never changes size, so crawling can't squeeze it into floors.
    if (obj.isVent && pl.sim.canCrawlThrough()) return false;

    // Walking (or drifting) sideways into a ledge whose underside is at head height: resolve it as a
    // wall bump. Arcade would otherwise push the player DOWN, which can squeeze them through the floor.
    const headOverlap = sb.bottom - pb.y;
    if (!isCrusher && headOverlap > 0 && headOverlap < pb.height * 0.6 && startY(pb) >= sb.bottom - 1 && pb.velocity.y >= -1) {
      if (pb.center.x < sb.center.x) { pb.x = sb.x - pb.width; pb.blocked.right = true; }
      else { pb.x = sb.right; pb.blocked.left = true; }
      pb.velocity.x = 0;
      return false;
    }
    return true;
  }

  /** Anchor slam landing: breaks debris it lands on. */
  #slamAt(x, feet) {
    for (const d of this.level.debris) {
      if (d.broken) continue;
      if (x > d.data.x - 10 && x < d.data.x + d.data.w + 10 && Math.abs(feet - d.data.y) < 10) {
        this.level.breakObject(d);
        this.#playFx({ type: 'smash', x: d.data.x + d.data.w / 2, y: d.data.y });
      }
    }
  }

  #stackRule(a, b) {
    const [sa, sb] = [a.sim, b.sim];
    if (sa.ride || sb.ride) return false;
    const [top, bottom] = a.body.center.y < b.body.center.y ? [a, b] : [b, a];
    if (bottom.sim.planted) return true;                        // a planted Anchor is solid
    const landing = cameFromAbove(top.body, bottom.body, 8) && top.body.velocity.y >= bottom.body.velocity.y;
    if (landing) bottom.body.pushable = false;                  // don't push the lower player into the floor
    return landing;
  }

  // ---------------------------------------------------------------- host: players
  addPlayer(id, name, near = null) {
    const i = this.sims.size;
    const role = ROLE_ORDER[i % ROLE_ORDER.length];              // temporary until lobby role assignment
    const at = near ? { x: near.x + 30, y: near.feet } : this.#spawnPoint(role, i);
    const sim = new PlayerSim(this, this.playerGroup, id, name, role, at.x, at.y - 2);
    if (near) sim.checkpoint = { ...near.checkpoint };
    if (this.levelData.allAbilities) sim.unlockAll();    // test levels (Ability Gym)
    this.sims.set(id, sim);
  }

  /** Levels with per-role zones (the Awakening) spawn each role in its own zone. */
  #spawnPoint(role, i) {
    const s = this.levelData.spawns?.[role];
    if (s) return { x: s.x, y: s.y };
    return { x: this.levelData.spawn.x + i * this.levelData.spawn.spacing, y: 460 };
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
  setRole(ownerId, role) {
    const sim = this.sims.get(this.#controlled(ownerId));
    if (!sim || sim.role === role) return;
    sim.setRole(role);
    if (this.levelData.allAbilities) sim.unlockAll();
    // In zone-based levels, switching role also moves you to that role's zone (developer testing).
    const s = this.levelData.spawns?.[role];
    if (s) {
      sim.checkpoint = { x: s.x, y: s.y };
      sim.respawn();
    }
  }

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

  /** Key 9 (developer): unlock every ability of the controlled character's role. */
  devUnlockAll(ownerId) { this.sims.get(this.#controlled(ownerId))?.unlockAll(); }

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
    this.followLocal();
  }

  /**
   * Dev inspect mode (key 8, host only): everything runs at half speed and the camera zooms in 1.5×,
   * so animations can be studied closely. Level timing and jump distances stay the same, just slower.
   */
  toggleInspect() {
    const on = this.slowMo === 1;
    this.slowMo = on ? 0.5 : 1;
    this.baseZoom = on ? 1.5 : 1;
    this.physics.world.slowMo = this.slowMo;
    this.tweens.timeScale = this.slowMo;
    if (!this.scripted?.revealing) this.cameras.main.zoomTo(this.baseZoom, 300);
  }

  /** (Re)attach the camera to the locally controlled character, unless a scripted camera move is running. */
  followLocal() {
    const view = this.views.get(this.localControl);
    if (view && !this.scripted?.revealing) this.cameras.main.startFollow(view, false, 0.1, 0.1);
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
      if (dev?.unlockAll) this.devUnlockAll(this.myId);
      if (dev?.inspect) this.toggleInspect();
      this.setInput(this.myId, input);
      this.#stepHost(time / 1000, (deltaMs / 1000) * this.slowMo);
    } else {
      if (dev?.role !== undefined) this.net.send({ t: 'role', role: ROLE_ORDER[dev.role] });
      if (dev?.spawn) this.net.send({ t: 'dev', action: 'spawn' });
      if (dev?.cycle) this.net.send({ t: 'dev', action: 'cycle' });
      if (dev?.unlockAll) this.net.send({ t: 'dev', action: 'unlockAll' });
      const key = JSON.stringify(input);
      if (key !== this.lastSentInput) { this.net.send({ t: 'input', input }); this.lastSentInput = key; }
      const frame = this.buffer.sampleAll();
      if (frame) { this.#syncViews(frame.players); this.level.applyEntities(frame.ents); }
    }
    this.level.draw(time);
    this.#drawBeams();
    this.#updateMood(time, deltaMs / 1000);
    this.#updateHint(input);
    this.#updateLeverHints();
  }

  /** Lighting, fog/grain and scripted moments (all clients). */
  #updateMood(time, dt) {
    const lights = this.level.lights();
    const beams = [];
    const flares = [];
    for (const v of this.views.values()) {
      const s = v.lastState;
      if (!s) continue;
      lights.push({ x: s.x, y: s.y - 20, r: 55, a: 0.35 });                        // everyone is faintly visible
      if (s.role === 'weaver' && s.ab?.includes('beam')) lights.push({ x: s.x, y: s.y - 22, r: 30 + 60 * (s.energy ?? 100) / 100, a: 0.85 });
      if (Array.isArray(s.beam)) {
        const [x1, y1, x2, y2] = s.beam;
        beams.push({ x1, y1, x2, y2 });
        lights.push({ x: x2, y: y2, r: 70, a: 0.9 });
      }
      if (s.flare) { lights.push({ x: s.x, y: s.y - 20, r: 220, a: 1 }); flares.push({ x: s.x, y: s.y - 20 }); }
    }
    this.atmosphere.update(time, lights, beams);
    this.backdrops.update();
    this.bg.setScale(1 / this.cameras.main.zoom);
    const me = this.views.get(this.localControl);
    this.scripted.update(time, dt, me ? { x: me.x, y: me.y } : null, flares);
  }

  #stepHost(now, dt) {
    const players = [...this.sims.values()];
    const fx = (type, x, y, extra = {}) => {
      const f = { type, x: Math.round(x), y: Math.round(y), ...extra };
      this.pendingFx.push(f);
      this.#playFx(f);
      if (type === 'slam') this.#slamAt(x, y);
    };
    const ctx = { level: this.level, players, time: now, dt, fx };

    for (const p of players) p.step(ctx);
    this.#stepWorld(ctx);
    for (const p of players) p.interactPressed = false;

    // Code Fragments: the matching role touching one earns its ability.
    this.level.fragments.forEach((f, i) => {
      if (f.taken) return;
      // Tall pickup column, so a fragment is collected whether you walk or jump through it.
      const zone = new Phaser.Geom.Rectangle(f.data.x - 18, f.data.y - 110, 36, 110);
      const p = players.find((q) => q.role === f.data.role && hit(q.bounds, zone));
      if (!p) return;
      this.level.setFragmentTaken(i, true);
      if (p.unlock(f.data.ability)) fx('unlock', p.x, p.feet, { id: p.id, a: f.data.ability });
    });

    for (const p of players) {
      if (p.ride) continue;
      // Touching a checkpoint makes it yours (latest one touched wins).
      for (const c of this.level.checkpoints) {
        if (Math.abs(p.x - c.x) < 40 && p.feet <= c.y + 4 && p.feet > c.y - 120) p.checkpoint = { x: c.x, y: c.y };
      }
      // Falling out of the world or into a hazard respawns you.
      if (p.feet > this.levelData.height + 60 || this.level.hazards.some((h) => hit(p.bounds, h))) p.respawn();
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
    // Heavy plates: only a (standing or planted) Anchor presses them. Latching plates stay down.
    L.plates.forEach((pl, i) => {
      const zone = new Phaser.Geom.Rectangle(pl.data.x, pl.data.y - 6, pl.data.w, 14);
      const pressed = players.some((p) => p.role === 'anchor' && hit(p.bounds, zone));
      L.setPlatePressed(i, pressed || (pl.data.latch && pl.pressed));
    });
    // Switches: pressed by a thrown crate, then stay pressed.
    for (const b of L.buttons) if (!b.pressed && L.crates.some((c) => hit(c.view.getBounds(), b.rect))) b.pressed = true;
    // Levers: pressing E within reach pulls one; it stays pulled.
    L.levers.forEach((lv, i) => {
      if (!lv.on && players.some((p) => p.interactPressed && hit(p.bounds, lv.zone))) L.setLever(i, true);
    });
    // Nodes: lit while light hits them; latching nodes stay on once powered.
    for (const n of L.nodes) {
      n.lit = n.litUntil > time;
      if (n.lit && n.data.latch) n.latched = true;
    }
    for (const p of L.phantom) {
      p.lit = p.litUntil > time;
      p.view.body.enable = p.lit;
    }
    // Gates open while their plate is pressed / node is lit / switch is pressed. A gate never closes on a player.
    L.gates.forEach((g, i) => {
      const plate = L.plates.find((p) => p.data.opens === g.data.id);
      const node = L.nodes.find((n) => n.data.opens === g.data.id);
      const button = L.buttons.find((b) => b.data.opens === g.data.id);
      const lever = L.levers.find((lv) => lv.data.opens === g.data.id);
      const wantOpen = !!(plate?.pressed || node?.lit || node?.latched || button?.pressed || lever?.on);
      const blocked = players.some((p) => hit(p.bounds, new Phaser.Geom.Rectangle(g.data.x, g.data.y, g.data.w, g.data.h)));
      L.setGateOpen(i, wantOpen || (g.open && blocked));
    });

    // Crushers: cycle down/up; a bracing Warden holds them up; anyone caught underneath respawns
    // (a 'safe' crusher just shoves you back out instead).
    for (const c of L.crushers) {
      c.t = (c.t + dt) % c.data.period;
      const phase = c.t / c.data.period;                          // 0..1
      const down = phase < 0.5 ? Math.min(1, phase * 4) : Math.max(0, 1 - (phase - 0.5) * 4);
      let bottom = c.data.top + c.data.h + down * (c.floor - c.data.top - c.data.h);
      // Same reach as PlayerSim's brace check, so stepping under the edge already counts.
      // Only players between the crusher's top and its floor are affected (not other zones above/below).
      const inColumn = (p) => p.body.y >= c.data.top && p.feet <= c.floor + 2;
      const under = (p) => inColumn(p) && p.body.right > c.data.x - 4 && p.body.x < c.data.x + c.data.w + 4;
      const brace = players.find((p) => p.bracing && under(p));
      if (brace) bottom = Math.min(bottom, brace.body.y - 10);
      c.view.y = bottom - c.data.h / 2;
      c.view.body.reset(c.view.x, c.view.y);
      for (const p of players) {
        if (p === brace || !inColumn(p) || p.x < c.data.x || p.x > c.data.x + c.data.w) continue;   // crushed only when centred under it
        if (bottom > p.body.y + 6 && p.grounded) {
          if (c.data.safe) { p.body.reset(c.data.x - p.stats.w, p.body.center.y); p.body.setVelocity(-220, -200); }
          else p.respawn();
        }
      }
    }

    // Blocks slide only while pushed; friction stops them as soon as the push ends.
    for (const b of L.blocks) b.view.body.setDragX(b.view.pushedUntil > this.time.now ? 0 : 2000);
    // Crates slide to a stop on the ground but fly freely when thrown.
    for (const c of L.crates) if (c.view.body.enable) c.view.body.setDragX(c.view.body.blocked.down ? 600 : 0);

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

  #playFx({ type, x, y, id, a }) {
    if (type === 'unlock') return this.#playUnlock(x, y, id, a);
    const ring = this.add.circle(x, y, 6).setStrokeStyle(2, 0xffffff, 0.8).setDepth(7);
    const size = { slam: 90, smash: 50, flare: 60, throw: 30, yank: 30 }[type] ?? 30;
    this.tweens.add({ targets: ring, radius: size, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
    if (type === 'slam' || type === 'smash') this.cameras.main.shake(120, 0.004);
  }

  /** Earning an ability: light pulse + glitch; the local player also gets a key hint icon. */
  #playUnlock(x, y, id, ability) {
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(x, y - 24, 8).setStrokeStyle(2, 0xffffff, 0.9).setDepth(7);
      this.tweens.add({ targets: ring, radius: 70 + i * 30, alpha: 0, duration: 600, delay: i * 120, onComplete: () => ring.destroy() });
    }
    const view = this.views.get(id);
    if (view) this.tweens.add({ targets: [view.gfx, view.soft], alpha: 0.2, duration: 60, yoyo: true, repeat: 4 });
    if (id === this.localControl) this.#showHint(id, ability);
  }

  /** Keycap icon above the local character until the new ability's key is pressed (or 15 s pass). */
  #showHint(id, ability) {
    this.hint?.box.destroy();
    const role = Object.keys(ABILITIES).find((r) => ability in ABILITIES[r]);
    const key = ABILITIES[role]?.[ability];
    if (!key) return;
    const box = this.#keycap(key);
    this.tweens.add({ targets: box, alpha: 1, duration: 300 });
    this.hint = { box, id, key, until: this.time.now + 15000 };
  }

  /** A small keyboard-key icon (starts invisible). */
  #keycap(key) {
    const box = this.add.container(0, 0).setDepth(30);
    const label = this.add.text(0, 0, key, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#111111', fontStyle: 'bold' }).setOrigin(0.5);
    const w = Math.max(24, label.width + 12);
    const cap = this.add.rectangle(0, 0, w, 24, 0xeeeeee, 0.9).setStrokeStyle(2, 0x777777);
    box.add([cap, label]);
    return box.setAlpha(0);
  }

  /** [E] above an unpulled lever while the local character is within reach of it. */
  #updateLeverHints() {
    const me = this.views.get(this.localControl);
    for (const lv of this.level.levers) {
      lv.hint ??= this.#keycap('E').setPosition(lv.data.x, lv.data.y - 62);
      const near = !!me && !lv.on && Math.abs(me.x - lv.data.x) < 70 && Math.abs(me.y - lv.data.y) < 60;
      lv.hint.setAlpha(Phaser.Math.Linear(lv.hint.alpha, near ? 1 : 0, 0.15));
    }
  }

  #updateHint(input) {
    const h = this.hint;
    if (!h) return;
    const view = this.views.get(h.id);
    if (view) h.box.setPosition(view.x, view.y - 78);
    const crawled = h.key === 'S' && !!view?.lastState?.crouch;     // the Scout may duck automatically
    const used = crawled || { J: input.a1, K: input.a2, S: input.down, W: input.up || input.jump,
      'Shift+J': input.sprint && input.a1, '→': input.left || input.right }[h.key];
    if (used || this.time.now > h.until || h.id !== this.localControl) {
      this.hint = null;
      this.tweens.add({ targets: h.box, alpha: 0, duration: 400, delay: used ? 600 : 0, onComplete: () => h.box.destroy() });
    }
  }

  #removeView(id) {
    const view = this.views.get(id);
    if (!view) return;
    view.destroy();
    this.views.delete(id);
    this.onPlayers?.([...this.views.values()].map((v) => ({ name: v.label.text })));
  }
}
