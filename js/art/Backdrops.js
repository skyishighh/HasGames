// Painted background layers (AI-generated art), loaded from assets/bg/.
//
// A level lists its layers in `backdrops`. Each layer is one or more image files laid side by side;
// if they don't cover the layer's width, they repeat, every second copy mirrored so the seams always
// match. Missing files are skipped silently, so the game still runs before any art exists.
//
//   backdrops: [
//     { key: 'sky', files: ['awakening_sky.png'], factor: 0 },          // fixed to the screen
//     { key: 'far', files: ['awakening_far.png'], factor: 0.2 },        // slow parallax
//   ]
import { WIDTH, HEIGHT } from '../config.js';

const DIR = 'assets/bg/';
const DEPTH = -9;                     // behind the vault (-5) and terrain (1), above the flat bg (-10)

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
  let x = 0, i = 0;
  while (x < spanW) {
    const key = keys[i % keys.length];
    const img = scene.add.image(x, bottom, key).setOrigin(0, 1).setScrollFactor(f).setDepth(depth);
    const s = spanH / img.height;
    img.setScale(s);
    if (keys.length === 1 && i % 2) img.setFlipX(true);          // mirrored repeat: seamless edges
    x += img.width * s - 1;                                       // 1 px overlap hides hairline gaps
    i++;
  }
}
