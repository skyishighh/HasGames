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
const LAYERS = [           // draw order back to front, with parallax factor (0 = fixed to the screen)
  { slot: 'sky', factor: 0 },
  { slot: 'far', factor: 0.2 },
  { slot: 'mid', factor: 0.45 },
];

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
    const bd = level.backdrops;
    if (!bd) return;
    const zones = Object.values(bd.zones ?? {});
    // No zones: the default set covers the whole level. With zones: each zone gets its own set.
    const specs = zones.length ? zones : [{ rect: { x: 0, y: 0, w: level.width, h: level.height } }];
    specs.forEach((zone, zi) => {
      const objs = [];
      LAYERS.forEach(({ slot, factor }, li) => {
        const key = [zone[slot], bd.default?.[slot]].filter(Boolean).map(texKey).find((k) => scene.textures.exists(k));
        if (!key) return;
        const depth = DEPTH + li * 0.1 + zi * 0.01;
        if (factor === 0) objs.push(this.#screenLayer(key, depth));
        else objs.push(...this.#scrollingLayer(key, factor, zone.rect, level, depth));
      });
      this.sets.push({ rect: zone.rect, objs });
    });
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
    const tex = featheredKey(this.scene, key);
    const objs = [];
    let x = null;
    while (x === null || x < x0 + spanW) {
      const img = this.scene.add.image(0, bottom, tex).setOrigin(0, 1).setScrollFactor(f).setDepth(depth);
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

/** A copy of the texture whose left and right FEATHER fractions fade to transparent (made once). */
function featheredKey(scene, key) {
  const out = `${key}_feather`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage();
  const t = scene.textures.createCanvas(out, src.width, src.height);
  const ctx = t.getContext();
  ctx.drawImage(src, 0, 0);
  const g = ctx.createLinearGradient(0, 0, src.width, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(FEATHER, 'rgba(0,0,0,1)');
  g.addColorStop(1 - FEATHER, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';        // keep pixels, scaled by the ramp
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, src.width, src.height);
  t.refresh();
  return out;
}
