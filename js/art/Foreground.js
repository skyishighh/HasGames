// Limbo-style foreground: a few big, blurred, near-black trunks between the camera and the play
// area. They scroll faster than the camera (parallax factor > 1), so they feel close to the lens.
// Drawn in code (seeded, so every client sees the same trees) and blurred once at load.
//
// Level option:  foreground: { factor: 1.4, spacing: [1100, 1800] }   (omit to disable)
import { WIDTH, HEIGHT } from '../config.js';

const DEPTH = 12;             // above terrain, props and characters; below darkness (20) and vignette
const TEX_W = 260, TEX_H = 1024, BLUR = 10, VARIANTS = 3;
const ALPHA = 0.93;

export class Foreground {
  constructor(scene, level) {
    const opt = level.foreground;
    if (!opt) return;
    const f = opt.factor ?? 1.4;
    const [minGap, maxGap] = opt.spacing ?? [1100, 1800];
    const rng = new Phaser.Math.RandomDataGenerator([`${level.name}-fg`]);
    const keys = Array.from({ length: VARIANTS }, (_, i) => trunkTexture(scene, i));

    // With scroll factor f, a layer covering the whole level spans view + (level - view) * f.
    const spanW = WIDTH + (level.width - WIDTH) * f;
    const spanH = HEIGHT + (level.height - HEIGHT) * f;
    for (let x = rng.between(200, 700); x < spanW; x += rng.between(minGap, maxGap)) {
      const img = scene.add.image(x, 0, rng.pick(keys)).setOrigin(0.5, 0)
        .setScrollFactor(f).setDepth(DEPTH).setAlpha(ALPHA);
      const width = rng.between(140, 240);                        // on-screen trunk thickness
      img.setScale(width / (TEX_W * 0.45), spanH / TEX_H);
      img.setFlipX(rng.frac() < 0.5);
    }
  }
}

/** One blurred trunk variant: a tapered, slightly crooked column with a couple of branch stubs. */
function trunkTexture(scene, variant) {
  const key = `fg_trunk_${variant}`;
  if (scene.textures.exists(key)) return key;
  const rng = new Phaser.Math.RandomDataGenerator([`fg-trunk-${variant}`]);
  const sharp = document.createElement('canvas');
  sharp.width = TEX_W; sharp.height = TEX_H;
  const s = sharp.getContext('2d');
  s.fillStyle = '#050505';

  // Trunk: left and right edges wander a little, wider at the bottom.
  const cx = TEX_W / 2, steps = 16, left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * TEX_H, half = TEX_W * (0.17 + 0.06 * (i / steps));
    const wobble = rng.realInRange(-6, 6);
    left.push([cx - half + wobble, y]);
    right.push([cx + half + wobble, y]);
  }
  s.beginPath();
  s.moveTo(...left[0]);
  for (const p of left) s.lineTo(...p);
  for (const p of right.reverse()) s.lineTo(...p);
  s.closePath();
  s.fill();

  // Branch stubs: thick, short, angled upwards (they get cut off by the texture edge, like Limbo).
  s.lineCap = 'round';
  for (let b = 0; b < 2; b++) {
    const y = rng.between(TEX_H * 0.15, TEX_H * 0.55), dir = b % 2 ? 1 : -1;
    s.lineWidth = rng.between(10, 18);
    s.beginPath();
    s.moveTo(cx, y);
    s.lineTo(cx + dir * TEX_W * 0.48, y - rng.between(30, 80));
    s.stroke();
  }

  // Bake the blur (once): Limbo's foreground is always out of focus.
  const t = scene.textures.createCanvas(key, TEX_W, TEX_H);
  const ctx = t.getContext();
  ctx.filter = `blur(${BLUR}px)`;
  ctx.drawImage(sharp, 0, -BLUR * 2, TEX_W, TEX_H + BLUR * 4);   // oversize vertically: no faded ends
  t.refresh();
  return key;
}
