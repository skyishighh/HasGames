// Builds a level from data. Visuals are created on every client; physics
// bodies only on the host (withPhysics = true). Dynamic state (gates, plates)
// is applied through setGateOpen / setPlatePressed so guests can mirror the host.
const SILHOUETTE = 0x050505;
const GATE_SLIDE_MS = 350;

export class Level {
  constructor(scene, data, withPhysics) {
    this.scene = scene;
    this.data = data;
    this.#createParallax();

    this.solids = withPhysics ? scene.physics.add.staticGroup() : null;
    for (const r of data.solids) {
      const rect = scene.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, SILHOUETTE);
      this.solids?.add(rect);
    }

    // Plates: visual pad that sinks a little when pressed.
    this.plates = data.plates.map((p) => ({
      data: p,
      pressed: false,
      view: scene.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, 0x2a2a2a),
    }));

    // Gates: invisible static body (host only) + separate visual that slides up.
    this.gates = data.gates.map((g) => {
      const view = scene.add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h, SILHOUETTE);
      let body = null;
      if (withPhysics) {
        body = scene.add.rectangle(g.x + g.w / 2, g.y + g.h / 2, g.w, g.h).setVisible(false);
        scene.physics.add.existing(body, true);
      }
      return { data: g, open: false, view, body };
    });

    // Finish: a faint shaft of light.
    const f = data.finish;
    scene.add.rectangle(f.x + f.w / 2, f.y + f.h / 2, f.w, f.h, 0xffffff, 0.08);
  }

  /** Static bodies players collide with (host only). */
  colliders() {
    return [this.solids, ...this.gates.map((g) => g.body)];
  }

  setPlatePressed(i, pressed) {
    const plate = this.plates[i];
    if (!plate || plate.pressed === pressed) return;
    plate.pressed = pressed;
    plate.view.y = plate.data.y + plate.data.h / 2 + (pressed ? 4 : 0);
    plate.view.fillColor = pressed ? 0x555555 : 0x2a2a2a;
  }

  setGateOpen(i, open) {
    const gate = this.gates[i];
    if (!gate || gate.open === open) return;
    gate.open = open;
    if (gate.body) gate.body.body.enable = !open;
    const closedY = gate.data.y + gate.data.h / 2;
    this.scene.tweens.killTweensOf(gate.view);
    this.scene.tweens.add({
      targets: gate.view, y: open ? closedY - gate.data.h + 6 : closedY,
      duration: GATE_SLIDE_MS, ease: 'Sine.easeInOut',
    });
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
        g.fillRect(x, 110, w, data.height);                      // trunk
        g.fillTriangle(x, 120, x + w / 2, rng.between(40, 100), x + w, 120); // broken top
      }
    }
  }
}
