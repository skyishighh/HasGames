// Painted background layers (AI-generated art), loaded from assets/bg/.
//
// Every background set has three layers: a screen-fixed sky, a slow far layer and a medium mid
// layer. A level gives a default set and, optionally, one set per zone. Each zone's set is shown
// while the camera is inside that zone, and cross-fades into the next zone's set near the border.
// A missing zone image falls back to the default image for that layer, and a missing default is
// skipped, so the game runs before any art exists.
//
//   backdrops: {
//     default: { sky: 'awakening_sky.png', far: 'awakening_far.png', mid: 'awakening_mid.png' },
//     zones: {
//       pit: { rect: { x: 0, y: 0, w: 2500, h: 1000 }, sky: 'pit_sky.png', far: 'pit_far.png', mid: 'pit_mid.png' },
//     },
//   }
//
// Images narrower than a layer repeat, each copy cross-fading into the previous one (no hard seams).
import { WIDTH, HEIGHT } from '../config.js';

const DIR = 'assets/bg/';
const DEPTH = -9;          // behind the vault (-5) and terrain (1), above the flat bg (-10)
const FEATHER = 0.2;       // cross-fade width between repeats, as a fraction of image width
const FADE = 300;          // px: how far outside a zone its backgrounds are still (fading) visible
// Draw order back to front. factor = parallax (0 = fixed to the screen). The rest is the Limbo-style
// depth of field, baked into the texture once at load: the further away, the blurrier, flatter and
// foggier. The play layer (terrain, characters) is never blurred, so it stays sharp and readable.
const LAYERS = [
  { slot: 'sky', factor: 0,    blur: 14, contrast: 0.7, brightness: 1,    fog: 0 },
  { slot: 'far', factor: 0.2,  blur: 8,  contrast: 0.8, brightness: 1,    fog: 0.2 },
  { slot: 'mid', factor: 0.45, blur: 4,  contrast: 1.1, brightness: 0.75, fog: 0 },
];
const FOG = '215,215,210';

const texKey = (file) => `bd_${file}`;

/** Queue every backdrop image for loading. Call from the scene's preload(). */
export function preloadBackdrops(scene, level) {
  const bd = level.backdrops;
  if (!bd) return;
  const files = new Set();
  for (const set of [bd.default, ...Object.values(bd.zones ?? {})]) {
    for (const { slot } of LAYERS) if (set?.[slot]) files.add(set[slot]);
  }
  for (const f of files) scene.load.image(texKey(f), DIR + f);
  // A missing image is expected during development: don't let it spam errors or stop the scene.
  scene.load.on('loaderror', (file) => console.info(`[backdrops] not found, skipped: ${file.src}`));
}

export class Backdrops {
  constructor(scene, level) {
    this.scene = scene;
    this.sets = [];            // { rect, objs: [] }
    const sources = new Set();
    const bd = level.backdrops;
    if (!bd) return;
    const zones = Object.values(bd.zones ?? {});
    // No zones: the default set covers the whole level. With zones: each zone gets its own set.
    const specs = zones.length ? zones : [{ rect: { x: 0, y: 0, w: level.width, h: level.height } }];
    specs.forEach((zone, zi) => {
      const objs = [];
      LAYERS.forEach((layer, li) => {
        const src = [zone[layer.slot], bd.default?.[layer.slot]].filter(Boolean).map(texKey).find((k) => scene.textures.exists(k));
        if (!src) return;
        sources.add(src);
        const key = bake(scene, src, layer);
        const depth = DEPTH + li * 0.1 + zi * 0.01;
        if (layer.factor === 0) objs.push(this.#screenLayer(key, depth));
        else objs.push(...this.#scrollingLayer(key, layer.factor, zone.rect, level, depth));
      });
      this.sets.push({ rect: zone.rect, objs });
    });
    for (const k of sources) scene.textures.remove(k);   // only the baked copies are drawn: free the originals
    this.update();
  }

  /** Cross-fade zone sets by the camera's position. Call every frame. */
  update() {
    if (this.sets.length < 2) return;
    const cam = this.scene.cameras.main;
    const cx = cam.midPoint.x, cy = cam.midPoint.y;
    const weights = this.sets.map(({ rect: r }) => {
      const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w));
      const dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
      return Math.max(0, 1 - Math.hypot(dx, dy) / FADE);
    });
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    this.sets.forEach((set, i) => {
      const a = weights[i] / total;
      for (const o of set.objs) o.setVisible(a > 0.001).setAlpha(a);
    });
  }

  /** Screen-fixed: stretched to cover the view (keeps aspect). */
  #screenLayer(key, depth) {
    const img = this.scene.add.image(WIDTH / 2, HEIGHT / 2, key).setScrollFactor(0).setDepth(depth);
    const s = Math.max(WIDTH / img.width, HEIGHT / img.height);
    img.setScale(s);
    this.scene.atmosphere?.layers.push({ obj: img, baseScale: s });   // counter-scale camera zoom
    return img;
  }

  /**
   * Parallax layer for a zone. While the camera is in (or fading into) the zone, its left edge
   * ranges over [ax, bx]; with scroll factor f the layer must start at ax * f and span
   * WIDTH + (bx - ax) * f to always fill the screen. Same vertically. Images are scaled to that
   * height, bottom-aligned, and tiled left to right with soft cross-faded joins.
   */
  #scrollingLayer(key, f, rect, level, depth) {
    const ax = clamp(rect.x - FADE - WIDTH / 2, 0, level.width - WIDTH);
    const bx = clamp(rect.x + rect.w + FADE - WIDTH / 2, 0, level.width - WIDTH);
    const ay = clamp(rect.y - FADE - HEIGHT / 2, 0, level.height - HEIGHT);
    const by = clamp(rect.y + rect.h + FADE - HEIGHT / 2, 0, level.height - HEIGHT);
    const spanW = WIDTH + (bx - ax) * f;
    const spanH = HEIGHT + (by - ay) * f;
    const x0 = ax * f, bottom = ay * f + spanH;
    const objs = [];
    let x = null;
    while (x === null || x < x0 + spanW) {
      const img = this.scene.add.image(0, bottom, key).setOrigin(0, 1).setScrollFactor(f).setDepth(depth);
      const s = spanH / img.height;
      img.setScale(s);
      if (x === null) x = x0 - img.width * s * FEATHER;   // first tile's fade sits just off-screen
      img.x = x;
      x += img.width * s * (1 - FEATHER);
      objs.push(img);
    }
    return objs;
  }
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Bake a layer's look into a new canvas texture (once per image + layer): depth blur, flattened
 * contrast and a fog wash; scrolling layers also get soft left/right edges so repeats cross-fade.
 */
function bake(scene, key, { slot, factor, blur, contrast, brightness, fog }) {
  const out = `${key}_${slot}`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage();
  const w = src.width, h = src.height;
  const t = scene.textures.createCanvas(out, w, h);
  const ctx = t.getContext();
  ctx.filter = `blur(${blur}px) contrast(${contrast}) brightness(${brightness})`;
  // An opaque sky is drawn slightly oversized so the blur doesn't pull transparent edges inwards.
  const pad = factor === 0 ? blur * 2 : 0;
  ctx.drawImage(src, -pad, -pad, w + pad * 2, h + pad * 2);
  ctx.filter = 'none';
  if (fog) {                                                   // tint towards fog, keeping the alpha
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(${FOG},${fog})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (factor !== 0) {                                          // soft sides for cross-faded tiling
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(FEATHER, 'rgba(0,0,0,1)');
    g.addColorStop(1 - FEATHER, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  t.refresh();
  return out;
}
