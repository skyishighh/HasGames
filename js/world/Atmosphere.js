// Screen-space mood layers (all clients): darkness with light cut-outs, drifting fog,
// film grain and a vignette. Darkness is drawn into a small canvas each frame and
// scaled up — cheap, and the low resolution gives naturally soft light edges.
import { WIDTH, HEIGHT } from '../config.js';

const DARK_W = 480, DARK_H = 270;   // half resolution

export class Atmosphere {
  constructor(scene, level) {
    this.scene = scene;
    this.darkRegions = level.data.dark ?? [];
    this.layers = [];                 // screen-fixed objects that must counter-scale camera zoom

    if (this.darkRegions.length) {
      this.darkTex = scene.textures.createCanvas('darkness', DARK_W, DARK_H);
      this.darkImg = this.#screenLayer(scene.add.image(0, 0, 'darkness'), 20, WIDTH / DARK_W);
    }

    this.fog = this.#screenLayer(scene.add.tileSprite(0, 0, WIDTH, HEIGHT, this.#fogTexture()), 15, 1).setAlpha(0.18);
    this.#screenLayer(scene.add.image(0, 0, this.#vignetteTexture()), 24, 1);
    this.grain = this.#screenLayer(scene.add.tileSprite(0, 0, WIDTH, HEIGHT, this.#grainTexture()), 25, 1).setAlpha(0.07);
  }

  #screenLayer(obj, depth, baseScale) {
    obj.setScrollFactor(0).setDepth(depth).setOrigin(0.5).setPosition(WIDTH / 2, HEIGHT / 2);
    this.layers.push({ obj, baseScale });
    return obj;
  }

  /** lights: [{ x, y, r, a }] circles and beams: [{ x1, y1, x2, y2 }] in world space. */
  update(time, lights, beams) {
    const cam = this.scene.cameras.main;
    // Screen-fixed layers are still scaled by camera zoom; undo that so they always fill the screen.
    for (const { obj, baseScale } of this.layers) obj.setScale(baseScale / cam.zoom);

    this.fog.setTilePosition(cam.scrollX * 0.4 + time * 0.01, cam.scrollY * 0.2);
    this.grain.setTilePosition(Math.random() * 256, Math.random() * 256);

    if (!this.darkTex) return;
    const view = cam.worldView;
    const k = DARK_W / view.width;                        // world → darkness-canvas scale
    const tx = (x) => (x - view.x) * k, ty = (y) => (y - view.y) * DARK_H / view.height;
    const ctx = this.darkTex.getContext();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, DARK_W, DARK_H);
    let any = false;
    ctx.filter = 'blur(10px)';                               // soft edges: darkness fades in, no hard lines
    for (const d of this.darkRegions) {
      if (d.x > view.right || d.x + d.w < view.x || d.y > view.bottom || d.y + d.h < view.y) continue;
      ctx.fillStyle = `rgba(0,0,0,${d.alpha ?? 0.95})`;
      ctx.fillRect(tx(d.x), ty(d.y), d.w * k, d.h * DARK_H / view.height);
      any = true;
    }
    ctx.filter = 'none';
    if (any) {
      ctx.globalCompositeOperation = 'destination-out';     // lights erase darkness
      for (const l of lights) {
        const x = tx(l.x), y = ty(l.y), r = l.r * k;
        if (x < -r || y < -r || x > DARK_W + r || y > DARK_H + r) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${l.a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.lineCap = 'round';
      for (const b of beams) {
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 60 * k;
        ctx.beginPath(); ctx.moveTo(tx(b.x1), ty(b.y1)); ctx.lineTo(tx(b.x2), ty(b.y2)); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.9)';
        ctx.lineWidth = 22 * k;
        ctx.beginPath(); ctx.moveTo(tx(b.x1), ty(b.y1)); ctx.lineTo(tx(b.x2), ty(b.y2)); ctx.stroke();
      }
    }
    this.darkTex.refresh();
  }

  #fogTexture() {
    const key = 'fog';
    if (this.scene.textures.exists(key)) return key;
    const t = this.scene.textures.createCanvas(key, 512, 256);
    const ctx = t.getContext();
    const rng = new Phaser.Math.RandomDataGenerator(['fog']);
    for (let i = 0; i < 18; i++) {
      const x = rng.between(0, 512), y = rng.between(60, 220), r = rng.between(60, 140);
      for (const dx of [-512, 0, 512]) {                      // wrap so the tile repeats seamlessly
        const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        g.addColorStop(0, 'rgba(210,210,200,0.5)');
        g.addColorStop(1, 'rgba(210,210,200,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
      }
    }
    t.refresh();
    return key;
  }

  #grainTexture() {
    const key = 'grain';
    if (this.scene.textures.exists(key)) return key;
    const t = this.scene.textures.createCanvas(key, 256, 256);
    const ctx = t.getContext();
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    t.refresh();
    return key;
  }

  #vignetteTexture() {
    const key = 'vignette';
    if (this.scene.textures.exists(key)) return key;
    const t = this.scene.textures.createCanvas(key, WIDTH, HEIGHT);
    const ctx = t.getContext();
    const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.35, WIDTH / 2, HEIGHT / 2, WIDTH * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    t.refresh();
    return key;
  }
}
