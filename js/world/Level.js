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
    this.#createParallax();

    const add = scene.add;
    const phys = scene.physics;

    // --- Static geometry ---
    this.solids = withPhysics ? phys.add.staticGroup() : null;
    for (const r of data.solids) {
      const rect = add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, INK);
      this.solids?.add(rect);
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

    // --- Crushers ---
    this.crushers = (data.crushers ?? []).map((c) => {
      const view = add.rectangle(c.x + c.w / 2, c.top + c.h / 2, c.w, c.h, INK);
      add.rectangle(c.x + c.w / 2, c.top / 2, 6, c.top, 0x111111).setDepth(-1); // piston rod
      if (withPhysics) { phys.add.existing(view, false); view.body.setAllowGravity(false).setImmovable(true); }
      return { data: c, view, t: 0, bottomY: 460, braced: false };
    });

    // --- Wind ---
    this.wind = (data.wind ?? []).map((w) => ({
      data: w, rect: rectOf(w), active: false, t: 0,
      streaks: add.graphics().setDepth(5),
    }));

    // --- Plates, gates, nodes, phantom platforms, hooks ---
    this.plates = (data.plates ?? []).map((p) => ({
      data: p, pressed: false, view: add.rectangle(p.x + p.w / 2, p.y + 4, p.w, 8, DIM),
    }));
    this.gates = (data.gates ?? []).map((g) => {
      const view = add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h, INK);
      let body = null;
      if (withPhysics) {
        body = add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h).setVisible(false);
        phys.add.existing(body, true);
      }
      return { data: g, open: false, view, body };
    });
    this.nodes = (data.nodes ?? []).map((n) => ({
      data: n, lit: false, litUntil: 0, view: add.circle(n.x, n.y, 7, 0x333333).setStrokeStyle(2, 0x111111),
    }));
    this.phantom = (data.phantom ?? []).map((p) => {
      const view = add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, 0xffffff, 0.06)
        .setStrokeStyle(1, 0xffffff, 0.15);
      if (withPhysics) { phys.add.existing(view, true); view.body.enable = false; }
      return { data: p, lit: false, litUntil: 0, view };
    });
    this.hooks = (data.hooks ?? []).map((h) => ({ data: h, view: add.circle(h.x, h.y, 5, 0x111111).setStrokeStyle(2, 0x777777) }));

    this.chainGfx = add.graphics().setDepth(4);
    this.chain = null; // { x1, y1, x2, y2 }
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

  // ---------- State sync ----------
  /** Host: compact dynamic state for the network snapshot. */
  getState() {
    const pos = (o) => [Math.round(o.view.x), Math.round(o.view.y)];
    return {
      ents: Object.fromEntries([...this.blocks, ...this.crates].map((o) => [o.id, pos(o)])),
      broken: [...this.cracked, ...this.fragile].filter((b) => b.broken).map((b) => b.id),
      gates: this.gates.map((g) => g.open),
      plates: this.plates.map((p) => p.pressed),
      nodes: this.nodes.map((n) => n.lit),
      phantom: this.phantom.map((p) => p.lit),
      crushers: this.crushers.map((c) => Math.round(c.view.y)),
      wind: this.wind.map((w) => w.active),
      chain: this.chain && [this.chain.x1, this.chain.y1, this.chain.x2, this.chain.y2].map(Math.round),
    };
  }

  /** All clients: apply discrete state (host calls it too, to drive visuals). */
  applyState(s) {
    if (!s) return;
    if (Array.isArray(s.broken)) for (const b of [...this.cracked, ...this.fragile]) if (s.broken.includes(b.id)) this.#breakVisual(b);
    s.gates?.forEach((v, i) => this.setGateOpen(i, !!v));
    s.plates?.forEach((v, i) => this.#setPlateVisual(i, !!v));
    s.nodes?.forEach((v, i) => {
      const n = this.nodes[i]; if (!n) return;
      n.lit = !!v;
      n.view.fillColor = v ? 0xffffff : 0x333333;
    });
    s.phantom?.forEach((v, i) => {
      const p = this.phantom[i]; if (!p) return;
      p.lit = !!v;
      p.view.fillAlpha = v ? 0.9 : 0.06; p.view.fillColor = v ? 0xdddddd : 0xffffff;
    });
    if (!this.host) s.crushers?.forEach((y, i) => { if (this.crushers[i]) this.crushers[i].view.y = y; });
    s.wind?.forEach((v, i) => { if (this.wind[i]) this.wind[i].active = !!v; });
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
    if (gate.body) gate.body.body.enable = !open;
    const closedY = gate.data.y + gate.data.h / 2;
    this.scene.tweens.killTweensOf(gate.view);
    this.scene.tweens.add({ targets: gate.view, y: open ? closedY - gate.data.h + 6 : closedY, duration: GATE_SLIDE_MS, ease: 'Sine.easeInOut' });
  }

  /** Per-frame cosmetic updates (all clients). */
  draw(time) {
    for (const w of this.wind) {
      const g = w.streaks.clear();
      if (!w.active) continue;
      g.lineStyle(1, 0xffffff, 0.25);
      const r = w.data, dir = Math.sign(r.push);
      for (let i = 0; i < 14; i++) {
        const y = r.y + ((i * 37) % r.h);
        const x = r.x + (((time * 0.6 * -dir) + i * 91) % r.w + r.w) % r.w;
        g.lineBetween(x, y, x + 30 * -dir * -1, y);
      }
    }
    const c = this.chainGfx.clear();
    if (this.chain) {
      c.lineStyle(3, 0x0a0a0a, 1).lineBetween(this.chain.x1, this.chain.y1, this.chain.x2, this.chain.y2);
      c.lineStyle(1, 0x888888, 0.6).lineBetween(this.chain.x1, this.chain.y1, this.chain.x2, this.chain.y2);
    }
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
