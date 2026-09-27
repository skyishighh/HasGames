// Builds a level from data. Visuals are created on every client; physics
// bodies only on the host (withPhysics = true). Dynamic state is exported by
// the host with getState() and mirrored on guests with applyState().
const INK = 0x050505;
const DIM = 0x2a2a2a;
const GATE_SLIDE_MS = 350;

const rectOf = (r) => new Phaser.Geom.Rectangle(r.x, r.y, r.w, r.h);

export class Level {
  constructor(scene, data, withPhysics) {
    this.scene = scene;
    this.data = data;
    this.host = withPhysics;
    this.floorY = data.floorY ?? 460;          // default crusher floor (gym)
    // Checkpoints may be plain x values (gym) or { x, y } feet positions.
    this.checkpoints = (data.checkpoints ?? []).map((c) => (typeof c === 'number' ? { x: c, y: this.floorY } : c));
    this.hazards = (data.hazards ?? []).map(rectOf);

    if (data.parallax !== false) this.#createParallax();
    if (data.vault) this.#createVault(data.vault);

    const add = scene.add;
    const phys = scene.physics;

    // --- Static geometry ---
    this.solids = withPhysics ? phys.add.staticGroup() : null;
    this.vents = [];
    for (const r of data.solids) {
      const rect = add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, INK);
      this.solids?.add(rect);
      if (r.vent) {                                   // crawl-through opening: draw its base as a grate
        rect.isVent = true;
        this.vents.push(rectOf(r));
        const g = add.graphics();
        g.fillStyle(0x3a3a3a, 1).fillRect(r.x, r.y + r.h - 24, r.w, 24);
        g.lineStyle(2, 0x111111, 1);
        for (let x = r.x + 6; x < r.x + r.w; x += 10) g.lineBetween(x, r.y + r.h - 24, x, r.y + r.h);
      }
    }

    this.oneWay = (data.oneWay ?? []).map((r) => {
      const view = add.rectangle(r.x + r.w / 2, r.y + 4, r.w, 8, 0x1a1a1a);
      if (withPhysics) phys.add.existing(view, true);
      return { data: r, view };
    });

    this.mesh = (data.mesh ?? []).map((r) => {
      const g = add.graphics().lineStyle(1, 0x111111, 0.9);
      for (let x = r.x; x <= r.x + r.w; x += 10) g.lineBetween(x, r.y, x, r.y + r.h);
      for (let y = r.y; y <= r.y + r.h; y += 10) g.lineBetween(r.x, y, r.x + r.w, y);
      return { data: r, rect: rectOf(r) };
    });

    // --- Dynamic objects (positions synced) ---
    this.blocks = (data.blocks ?? []).map((b) => this.#dynamicBox(b, b.w, b.h, INK, 2000));
    this.crates = (data.crates ?? []).map((c) => ({ ...this.#dynamicBox({ ...c, x: c.x - 10, y: c.y - 20 }, 20, 20, 0x151515, 600), carriedBy: null }));

    // --- Breakables ---
    this.cracked = (data.cracked ?? []).map((r) => this.#breakable(r, 0x101010));
    this.fragile = (data.fragile ?? []).map((r) => this.#breakable(r, 0x3a3a3a));
    this.debris = (data.debris ?? []).map((r) => this.#breakable(r, 0x202020));   // broken by Anchor slam

    // --- Crushers ---
    this.crushers = (data.crushers ?? []).map((c) => {
      const view = add.rectangle(c.x + c.w / 2, c.top + c.h / 2, c.w, c.h, INK);
      add.rectangle(c.x + c.w / 2, c.top - 200, 6, 400, 0x111111).setDepth(-1); // piston rod
      if (withPhysics) { phys.add.existing(view, false); view.body.setAllowGravity(false).setImmovable(true); }
      return { data: c, view, t: 0, floor: c.floor ?? this.floorY, braced: false };
    });

    // --- Wind ---
    this.wind = (data.wind ?? []).map((w) => ({
      data: w, rect: rectOf(w), active: false,
      t: w.startCalm ? w.on : 0,             // startCalm: begin in the calm phase
      streaks: add.graphics().setDepth(5),
    }));

    // --- Plates, buttons, gates/bridges, nodes, phantom platforms, hooks ---
    this.plates = (data.plates ?? []).map((p) => ({
      data: p, pressed: false, view: add.rectangle(p.x + p.w / 2, p.y + 4, p.w, 8, DIM),
    }));
    this.buttons = (data.buttons ?? []).map((b) => ({
      data: b, rect: rectOf(b), pressed: false,
      view: add.rectangle(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, 0x444444).setStrokeStyle(1, 0x999999, 0.6),
    }));
    this.gates = (data.gates ?? []).map((g) => (g.bridge ? this.#bridge(g) : this.#gate(g)));
    this.nodes = (data.nodes ?? []).map((n) => ({
      data: n, lit: false, litUntil: 0, latched: false,
      view: add.circle(n.x, n.y, 7, 0x333333).setStrokeStyle(2, 0x111111),
    }));
    this.phantom = (data.phantom ?? []).map((p) => {
      const view = add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, 0xffffff, 0.06)
        .setStrokeStyle(1, 0xffffff, 0.15);
      if (withPhysics) { phys.add.existing(view, true); view.body.enable = false; }
      return { data: p, lit: false, litUntil: 0, view };
    });
    this.hooks = (data.hooks ?? []).map((h) => ({ data: h, view: add.circle(h.x, h.y, 5, 0x111111).setStrokeStyle(2, 0x777777) }));

    // Code Fragments: touching one unlocks an ability for the matching role.
    this.fragments = (data.fragments ?? []).map((f) => ({
      data: f, taken: false,
      view: add.star(f.x, f.y - 26, 4, 4, 10, 0xffffff).setDepth(4),
      glow: add.circle(f.x, f.y - 26, 16, 0xffffff, 0.15).setDepth(4),
    }));

    this.chainGfx = add.graphics().setDepth(4);
    this.chain = null; // { x1, y1, x2, y2 }
  }

  #gate(g) {
    const view = this.scene.add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h, INK);
    let body = null;
    if (this.host) {
      body = this.scene.add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h).setVisible(false);
      this.scene.physics.add.existing(body, true);
    }
    return { data: g, open: false, view, body };
  }

  /** Drawbridge: stands upright (not walkable) until opened, then swings down flat. */
  #bridge(g) {
    const view = this.scene.add.rectangle(g.x + g.w, g.y + g.h / 2, g.w, g.h, INK).setOrigin(1, 0.5).setAngle(90);
    let body = null;
    if (this.host) {
      body = this.scene.add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h).setVisible(false);
      this.scene.physics.add.existing(body, true);
      body.body.enable = false;
    }
    return { data: g, open: false, view, body, bridge: true };
  }

  #dynamicBox(d, w, h, color, drag) {
    const view = this.scene.add.rectangle(d.x + w / 2, d.y + h / 2, w, h, color);
    if (this.host) {
      this.scene.physics.add.existing(view);
      view.body.setDragX(drag).setCollideWorldBounds(true);
    }
    return { id: d.id, view };
  }

  #breakable(r, color) {
    const view = this.scene.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, color);
    // crack lines so players can read "this can break"
    const g = this.scene.add.graphics().lineStyle(1, 0x555555, 0.8);
    g.lineBetween(r.x + r.w * 0.3, r.y, r.x + r.w * 0.6, r.y + r.h * 0.5);
    g.lineBetween(r.x + r.w * 0.6, r.y + r.h * 0.5, r.x + r.w * 0.35, r.y + r.h);
    if (this.host) this.scene.physics.add.existing(view, true);
    return { id: r.id, data: r, view, cracks: g, broken: false, breakAt: 0 };
  }

  get breakables() { return [...this.cracked, ...this.fragile, ...this.debris]; }

  /** Light sources the level itself provides (all clients): glowing nodes and lit phantom platforms. */
  lights() {
    const out = [];
    for (const f of this.fragments) if (!f.taken) out.push({ x: f.data.x, y: f.data.y - 26, r: 45, a: 0.8 });
    for (const n of this.nodes) out.push({ x: n.data.x, y: n.data.y, r: n.lit || n.latched ? 70 : 22, a: n.lit || n.latched ? 0.9 : 0.5 });
    for (const p of this.phantom) {
      out.push({ x: p.data.x + p.data.w / 2, y: p.data.y, r: p.lit ? 60 : 18, a: p.lit ? 0.8 : 0.35 });
    }
    return out;
  }

  // ---------- State sync ----------
  /** Host: compact dynamic state for the network snapshot. */
  getState() {
    const pos = (o) => [Math.round(o.view.x), Math.round(o.view.y)];
    return {
      ents: Object.fromEntries([...this.blocks, ...this.crates].map((o) => [o.id, pos(o)])),
      broken: this.breakables.filter((b) => b.broken).map((b) => b.id),
      gates: this.gates.map((g) => g.open),
      plates: this.plates.map((p) => p.pressed),
      buttons: this.buttons.map((b) => b.pressed),
      nodes: this.nodes.map((n) => n.lit || n.latched),
      phantom: this.phantom.map((p) => p.lit),
      crushers: this.crushers.map((c) => Math.round(c.view.y)),
      wind: this.wind.map((w) => w.active),
      frags: this.fragments.map((f) => f.taken),
      chain: this.chain && [this.chain.x1, this.chain.y1, this.chain.x2, this.chain.y2].map(Math.round),
    };
  }

  /** All clients: apply discrete state (host calls it too, to drive visuals). */
  applyState(s) {
    if (!s) return;
    if (Array.isArray(s.broken)) for (const b of this.breakables) if (s.broken.includes(b.id)) this.#breakVisual(b);
    s.gates?.forEach((v, i) => this.setGateOpen(i, !!v));
    s.plates?.forEach((v, i) => this.#setPlateVisual(i, !!v));
    s.buttons?.forEach((v, i) => {
      const b = this.buttons[i]; if (!b) return;
      b.pressed = !!v;
      b.view.fillColor = v ? 0xdddddd : 0x444444;
    });
    s.nodes?.forEach((v, i) => {
      const n = this.nodes[i]; if (!n) return;
      if (!this.host) n.lit = !!v;
      n.view.fillColor = v ? 0xffffff : 0x333333;
    });
    s.phantom?.forEach((v, i) => {
      const p = this.phantom[i]; if (!p) return;
      p.lit = !!v;
      p.view.fillAlpha = v ? 0.9 : 0.06; p.view.fillColor = v ? 0xdddddd : 0xffffff;
    });
    if (!this.host) s.crushers?.forEach((y, i) => { if (this.crushers[i]) this.crushers[i].view.y = y; });
    s.wind?.forEach((v, i) => { if (this.wind[i]) this.wind[i].active = !!v; });
    s.frags?.forEach((v, i) => this.setFragmentTaken(i, !!v));
    // The host owns the real chain object (with owner/lifetime); guests mirror its endpoints.
    if (!this.host) this.chain = Array.isArray(s.chain) ? { x1: s.chain[0], y1: s.chain[1], x2: s.chain[2], y2: s.chain[3] } : null;
  }

  /** Guests: interpolated positions for movable objects. */
  applyEntities(ents) {
    if (!ents) return;
    for (const o of [...this.blocks, ...this.crates]) {
      const p = ents[o.id];
      if (p) o.view.setPosition(p.x, p.y);
    }
  }

  // ---------- Visual helpers ----------
  #breakVisual(b) {
    if (b.broken && !b.view.visible) return;
    b.broken = true;
    b.view.setVisible(false);
    b.cracks.setVisible(false);
    if (b.view.body) b.view.body.enable = false;
  }

  breakObject(b) { this.#breakVisual(b); }

  setFragmentTaken(i, taken) {
    const f = this.fragments[i];
    if (!f || f.taken === taken) return;
    f.taken = taken;
    f.view.setVisible(!taken);
    f.glow.setVisible(!taken);
  }

  #setPlateVisual(i, pressed) {
    const p = this.plates[i];
    if (!p || p.pressed === pressed) return;
    p.pressed = pressed;
    p.view.y = p.data.y + 4 + (pressed ? 4 : 0);
    p.view.fillColor = pressed ? 0x666666 : DIM;
  }

  setPlatePressed(i, pressed) { this.#setPlateVisual(i, pressed); }

  setGateOpen(i, open) {
    const gate = this.gates[i];
    if (!gate || gate.open === open) return;
    gate.open = open;
    this.scene.tweens.killTweensOf(gate.view);
    if (gate.bridge) {
      if (gate.body) gate.body.body.enable = open;
      this.scene.tweens.add({ targets: gate.view, angle: open ? 0 : 90, duration: 600, ease: 'Bounce.easeOut' });
      return;
    }
    if (gate.body) gate.body.body.enable = !open;
    const closedY = gate.data.y + gate.data.h / 2;
    this.scene.tweens.add({ targets: gate.view, y: open ? closedY - gate.data.h + 6 : closedY, duration: GATE_SLIDE_MS, ease: 'Sine.easeInOut' });
  }

  /** Per-frame cosmetic updates (all clients). */
  draw(time) {
    for (const f of this.fragments) {        // slow float + pulse
      if (f.taken) continue;
      const y = f.data.y - 26 + Math.sin(time / 400 + f.data.x) * 4;
      f.view.setY(y).setAngle(time / 20);
      f.glow.setY(y).setScale(1 + Math.sin(time / 250) * 0.2);
    }
    for (const w of this.wind) {
      const g = w.streaks.clear();
      if (!w.active) continue;
      g.lineStyle(1, 0xffffff, 0.25);
      const r = w.data, dir = Math.sign(r.push);
      for (let i = 0; i < 14; i++) {
        const y = r.y + ((i * 37) % r.h);
        const x = r.x + ((((time * 0.6 * dir) + i * 91) % r.w) + r.w) % r.w;
        g.lineBetween(x, y, x - 30 * dir, y);
      }
    }
    const c = this.chainGfx.clear();
    if (this.chain) {
      c.lineStyle(3, 0x0a0a0a, 1).lineBetween(this.chain.x1, this.chain.y1, this.chain.x2, this.chain.y2);
      c.lineStyle(1, 0x888888, 0.6).lineBetween(this.chain.x1, this.chain.y1, this.chain.x2, this.chain.y2);
    }
  }

  /** The central vault (background silhouette), seen from every viewing platform. */
  #createVault(v) {
    const g = this.scene.add.graphics().setDepth(-5);
    g.fillStyle(0x151514, 1).fillRect(v.x, v.y, v.w, v.h);
    g.lineStyle(1, 0x3a3a38, 0.8);
    for (let x = v.x; x <= v.x + v.w; x += 40) g.lineBetween(x, v.y, x, v.y + v.h);
    for (let y = v.y; y <= v.y + v.h; y += 40) g.lineBetween(v.x, y, v.x + v.w, y);
    g.fillStyle(0xffffff, 0.08).fillCircle(v.x + v.w / 2, v.y + v.h / 2, 60);   // faint core light
    g.fillStyle(0x0c0c0b, 1).fillRect(v.x + v.w / 2 - 6, v.y - 400, 12, 400); // hanging chain
  }

  /** Two layers of tree silhouettes that scroll slower than the camera (depth). */
  #createParallax() {
    const { scene, data } = this;
    const rng = new Phaser.Math.RandomDataGenerator([data.name]); // seeded: same on every client
    for (const [factor, color, alpha] of [[0.3, 0x3a3a38, 0.6], [0.6, 0x1e1e1c, 0.8]]) {
      const g = scene.add.graphics().setScrollFactor(factor, 1);
      g.fillStyle(color, alpha);
      const layerWidth = scene.scale.width + (data.width - scene.scale.width) * factor;
      for (let x = rng.between(0, 80); x < layerWidth; x += rng.between(90, 220)) {
        const w = rng.between(8, 22);
        g.fillRect(x, 110, w, data.height);
        g.fillTriangle(x, 120, x + w / 2, rng.between(40, 100), x + w, 120);
      }
    }
  }
}
