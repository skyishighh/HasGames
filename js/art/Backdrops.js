// Painted background layers (AI-generated art), loaded from assets/bg/.
//
// A level lists its layers in `backdrops`. Each layer is one or more image files laid side by side;
// if they don't cover the layer's width, they repeat, each copy cross-fading softly into the previous
// one so there is no hard seam. Missing files are skipped silently, so the game runs without art.
//
//   backdrops: [
//     { key: 'sky', files: ['awakening_sky.png'], factor: 0 },          // fixed to the screen
//     { key: 'far', files: ['awakening_far.png'], factor: 0.2 },        // slow parallax
//   ]
import { WIDTH, HEIGHT } from '../config.js';

const DIR = 'assets/bg/';
const DEPTH = -9;                     // behind the vault (-5) and terrain (1), above the flat bg (-10)
const FEATHER = 0.2;                  // cross-fade width between repeats, as a fraction of image width

/** Queue every backdrop image for loading. Call from the scene's preload(). */
export function preloadBackdrops(scene, level) {
  for (const layer of level.backdrops ?? []) {
    layer.files.forEach((f, i) => scene.load.image(texKey(layer, i), DIR + f));
  }
  // A missing image is expected during development: don't let it spam errors or stop the scene.
  scene.load.on('loaderror', (file) => console.info(`[backdrops] not found, skipped: ${file.src}`));
}

/** Place the loaded layers. Returns how many layers were actually shown. */
export function createBackdrops(scene, level) {
  let shown = 0;
  (level.backdrops ?? []).forEach((layer, order) => {
    const keys = layer.files.map((_, i) => texKey(layer, i)).filter((k) => scene.textures.exists(k));
    if (!keys.length) return;
    const depth = DEPTH + order * 0.1;
    if (layer.factor === 0) placeScreenLayer(scene, keys[0], depth);
    else placeScrollingLayer(scene, level, layer, keys, depth);
    shown++;
  });
  return shown;
}

const texKey = (layer, i) => `bd_${layer.key}_${i}`;

/** Screen-fixed: stretched to cover the view (keeps aspect). */
function placeScreenLayer(scene, key, depth) {
  const img = scene.add.image(WIDTH / 2, HEIGHT / 2, key).setScrollFactor(0).setDepth(depth);
  const s = Math.max(WIDTH / img.width, HEIGHT / img.height);
  img.setScale(s);
  scene.atmosphere?.layers.push({ obj: img, baseScale: s });   // counter-scale camera zoom
}

/**
 * Parallax: a layer scrolling at `factor` must span view + (level - view) * factor to reach both
 * level edges. Images are scaled to that height, bottom-aligned, and tiled left to right.
 */
function placeScrollingLayer(scene, level, layer, keys, depth) {
  const f = layer.factor;
  const spanW = WIDTH + (level.width - WIDTH) * f;
  const spanH = HEIGHT + (level.height - HEIGHT) * f;
  const bottom = spanH + (layer.offsetY ?? 0);
  // Every tile fades out on both sides; neighbours overlap by the fade width so one fades in as the
  // other fades out. The first tile starts one fade-width left of the level, so its fade is off-screen.
  let x = null, i = 0;
  while (x === null || x < spanW) {
    const key = keys[i % keys.length];
    const img = scene.add.image(0, bottom, featheredKey(scene, key)).setOrigin(0, 1).setScrollFactor(f).setDepth(depth);
    const s = spanH / img.height;
    img.setScale(s);
    if (x === null) x = -img.width * s * FEATHER;
    img.x = x;
    x += img.width * s * (1 - FEATHER);
    i++;
  }
}

/** A copy of the texture whose left and right FEATHER fractions fade to transparent (made once). */
function featheredKey(scene, key) {
  const out = `${key}_feather`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage();
  const t = scene.textures.createCanvas(out, src.width, src.height);
  const ctx = t.getContext();
  ctx.drawImage(src, 0, 0);
  const w = src.width;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(FEATHER, 'rgba(0,0,0,1)');
  g.addColorStop(1 - FEATHER, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';                // keep pixels, scaled by the ramp
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, src.height);
  t.refresh();
  return out;
}
