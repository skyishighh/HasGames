// Client-side scripted moments (each client runs its own copy; purely cosmetic):
//  - Hollow glimpses: a figure that watches, then vanishes when approached or lit
//  - Triggers: 'reveal' (camera pulls back over the chasm), 'shake' (a sound in the dark)
const REVEAL_IN_MS = 2600, REVEAL_HOLD_MS = 3200, REVEAL_OUT_MS = 1400;

export class Scripted {
  constructor(scene, data) {
    this.scene = scene;
    this.data = data;
    this.fired = new Set();
    this.revealing = false;
    this.hollows = (data.hollows ?? []).map((h) => this.#createHollow(h));
    this.triggers = (data.triggers ?? []).map((t, i) => ({ ...t, id: i, rect: new Phaser.Geom.Rectangle(t.x, t.y, t.w, t.h) }));
  }

  #createHollow(h) {
    const g = this.scene.add.graphics().setDepth(h.type === 'dark' ? 3 : 2);
    const face = this.scene.add.rectangle(h.x + 2, h.y - 64, 8, 6, 0xcfe8ff).setDepth(g.depth);
    const hollow = { data: h, g, face, gone: false, litT: 0 };
    this.#drawHollow(hollow);
    if (h.grate) {
      const bars = this.scene.add.graphics().setDepth(4).lineStyle(3, 0x0a0a0a, 1);
      for (let x = h.x - 40; x <= h.x + 40; x += 12) bars.lineBetween(x, h.y - 110, x, h.y);
    }
    return hollow;
  }

  #drawHollow(hw) {
    const { x, y } = hw.data;
    const g = hw.g.clear().fillStyle(0x020202, 1);
    g.fillRect(x - 7, y - 58, 14, 58);          // tall, thin body
    g.fillCircle(x, y - 64, 8);                  // head (the face is a screen glow)
    g.lineStyle(2, 0x020202, 1);                 // trailing shadow cords
    g.lineBetween(x - 4, y - 30, x - 30, y - 6);
    g.lineBetween(x + 4, y - 20, x + 26, y);
  }

  /**
   * me: { x, y } of the locally controlled character (or null)
   * flares: [{ x, y }] of active Weaver flares (any player)
   */
  update(time, dt, me, flares) {
    for (const hw of this.hollows) {
      if (hw.gone) continue;
      // Screen-glow flicker, like a broken signal.
      hw.face.setAlpha(0.55 + Math.random() * 0.45);
      hw.g.x = Math.random() < 0.04 ? Phaser.Math.Between(-2, 2) : 0;
      hw.face.x = hw.data.x + 2 + hw.g.x;
      const near = me && Phaser.Math.Distance.Between(me.x, me.y, hw.data.x, hw.data.y) < hw.data.radius;
      if (hw.data.type === 'dark') {
        const lit = flares.some((f) => Phaser.Math.Distance.Between(f.x, f.y, hw.data.x, hw.data.y - 30) < 200);
        if (lit) hw.litT += dt;
        if (hw.litT > 0.6 || near) this.#vanish(hw);
      } else if (near) {
        this.#vanish(hw);
      }
    }

    if (!me) return;
    for (const t of this.triggers) {
      if (this.fired.has(t.id) || !t.rect.contains(me.x, me.y - 10)) continue;
      this.fired.add(t.id);
      if (t.action === 'reveal') this.#reveal();
      else if (t.action === 'shake') this.scene.cameras.main.shake(450, 0.006);
    }
  }

  #vanish(hw) {
    hw.gone = true;
    this.scene.tweens.add({
      targets: [hw.g, hw.face], alpha: 0, duration: 350,
      onUpdate: () => { hw.g.x = Phaser.Math.Between(-6, 6); },
      onComplete: () => { hw.g.destroy(); hw.face.destroy(); },
    });
  }

  /** Camera pulls back over the chasm so the player sees the other platforms. Only once per client. */
  #reveal() {
    const r = this.data.reveal;
    if (!r || this.revealedOnce) return;
    this.revealedOnce = true;
    this.revealing = true;
    const cam = this.scene.cameras.main;
    cam.stopFollow();
    cam.pan(r.x, r.y, REVEAL_IN_MS, 'Sine.easeInOut');
    cam.zoomTo(r.zoom, REVEAL_IN_MS, 'Sine.easeInOut');
    this.scene.time.delayedCall(REVEAL_IN_MS + REVEAL_HOLD_MS, () => {
      cam.zoomTo(1, REVEAL_OUT_MS, 'Sine.easeInOut');
      this.scene.time.delayedCall(REVEAL_OUT_MS * 0.4, () => {
        this.revealing = false;
        this.scene.followLocal();
      });
    });
  }
}
