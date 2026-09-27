// Hand-drawn, Limbo-style silhouettes generated in code.
//
// Physics still uses plain rectangles; this module only draws over them:
//  - drawTerrain(): all static solids painted ONCE into 1024×1024 canvas chunks (cheap at runtime)
//    with wobbly edges, grass on exposed tops and roots under exposed undersides
//  - roughTexture(): a small canvas texture for a prop (crate, block, gate, crusher, cracked wall…)
// A seeded random generator keeps every client's drawing identical.
const INK = '#050505';
const CHUNK = 1024;
// Limbo's play layer is clear but never razor-sharp: every terrain/prop texture gets a light blur,
// baked once. SEAM is the extra margin painted around each terrain chunk, so a chunk's softened edge
// always sits under its neighbour's solid interior (no faint lines between chunks).
const SOFTEN = 1;
const SEAM = 4;

/** A closed, slightly irregular outline around a rectangle (pushed outward so seams never show). */
function roughOutline(rng, x, y, w, h, wobble = 2.5, step = 10) {
  const pts = [];
  const edge = (x1, y1, x2, y2, nx, ny) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const out = rng.realInRange(0, wobble);            // only outward: adjacent solids overlap, no gaps
      pts.push([x1 + (x2 - x1) * t + nx * out, y1 + (y2 - y1) * t + ny * out]);
    }
  };
  edge(x, y, x + w, y, 0, -1);          // top
  edge(x + w, y, x + w, y + h, 1, 0);   // right
  edge(x + w, y + h, x, y + h, 0, 1);   // bottom
  edge(x, y + h, x, y, -1, 0);          // left
  return pts;
}

function fillPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

const inside = (solids, px, py) => solids.some((s) => px > s.x && px < s.x + s.w && py > s.y && py < s.y + s.h);

/** Grass blades along the exposed parts of a solid's top edge. */
function drawGrass(ctx, rng, solids, r) {
  ctx.strokeStyle = INK;
  for (let x = r.x + 2; x < r.x + r.w - 2; x += rng.between(3, 7)) {
    if (inside(solids, x, r.y - 3)) continue;                       // covered by another solid
    const h = rng.realInRange(3, 11) * (rng.frac() < 0.08 ? 2 : 1);  // occasional tall tuft
    const lean = rng.realInRange(-3, 3);
    ctx.lineWidth = rng.realInRange(0.8, 1.8);
    ctx.beginPath();
    ctx.moveTo(x, r.y + 1);
    ctx.quadraticCurveTo(x + lean * 0.3, r.y - h * 0.6, x + lean, r.y - h);
    ctx.stroke();
  }
}

/** Roots and thin vines hanging from the exposed parts of a solid's underside. */
function drawRoots(ctx, rng, solids, r) {
  ctx.strokeStyle = INK;
  for (let x = r.x + rng.between(6, 30); x < r.x + r.w - 4; x += rng.between(18, 60)) {
    if (inside(solids, x, r.y + r.h + 3)) continue;
    const len = rng.realInRange(6, 28);
    ctx.lineWidth = rng.realInRange(1, 2.2);
    ctx.beginPath();
    ctx.moveTo(x, r.y + r.h - 1);
    ctx.bezierCurveTo(x + rng.realInRange(-6, 6), r.y + r.h + len * 0.4,
      x + rng.realInRange(-8, 8), r.y + r.h + len * 0.7, x + rng.realInRange(-5, 5), r.y + r.h + len);
    ctx.stroke();
  }
}

/**
 * Paints all static solids into chunk images. Returns the created images.
 * @param solids level solids [{ x, y, w, h }]
 */
export function drawTerrain(scene, seed, solids, width, height, depth = 1) {
  const images = [];
  for (let cy = 0; cy < height; cy += CHUNK) {
    for (let cx = 0; cx < width; cx += CHUNK) {
      const pad = 40;                                   // grass/roots may reach into neighbouring chunks
      const here = solids.filter((s) => s.x < cx + CHUNK + pad && s.x + s.w > cx - pad && s.y < cy + CHUNK + pad && s.y + s.h > cy - pad);
      if (!here.length) continue;
      const key = `terrain-${seed}-${cx}-${cy}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      // SEAM px of overlap on each side hides chunk edges (texture filtering and the soften blur).
      const size = CHUNK + SEAM * 2;
      const tex = scene.textures.createCanvas(key, size, size);
      const ctx = tex.getContext();
      ctx.save();
      ctx.translate(-cx + SEAM, -cy + SEAM);
      ctx.fillStyle = INK;
      ctx.lineCap = 'round';
      for (const s of here) {
        // Per-solid seed: the same solid looks identical in every chunk it spans.
        const rng = new Phaser.Math.RandomDataGenerator([`${seed}:${s.x},${s.y},${s.w},${s.h}`]);
        fillPath(ctx, roughOutline(rng, s.x, s.y, s.w, s.h));
        drawGrass(ctx, rng, solids, s);
        drawRoots(ctx, rng, solids, s);
      }
      ctx.restore();
      soften(ctx, size, size);
      tex.refresh();
      images.push(scene.add.image(cx - SEAM, cy - SEAM, key).setOrigin(0).setDepth(depth));
    }
  }
  return images;
}

/**
 * A prop texture of size w×h (plus a small margin for rough edges). Style adds recognisable detail:
 * 'crate' planks, 'block' rivets, 'cracked' light cracks, 'gate' bars, 'crusher' teeth, 'plain'.
 * Returns the texture key; draw it with origin 0.5 at the prop's centre.
 */
export function roughTexture(scene, style, w, h, seed = 'prop') {
  const key = `rough-${style}-${Math.round(w)}x${Math.round(h)}-${seed}`;
  if (scene.textures.exists(key)) return key;
  const m = 4;
  const tex = scene.textures.createCanvas(key, Math.ceil(w) + m * 2, Math.ceil(h) + m * 2);
  const ctx = tex.getContext();
  const rng = new Phaser.Math.RandomDataGenerator([key]);
  ctx.translate(m, m);
  ctx.fillStyle = INK;
  fillPath(ctx, roughOutline(rng, 0, 0, w, h, 2, 8));
  ctx.lineCap = 'round';
  if (style === 'crate') {                      // faint plank seams and a cross brace
    ctx.strokeStyle = 'rgba(90,90,85,0.55)';
    ctx.lineWidth = 1;
    for (let y = h / 3; y < h; y += h / 3) { ctx.beginPath(); ctx.moveTo(2, y); ctx.lineTo(w - 2, y + rng.realInRange(-1, 1)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(w - 3, h - 3); ctx.stroke();
  } else if (style === 'block') {               // heavy riveted iron
    ctx.fillStyle = 'rgba(80,80,76,0.6)';
    for (const [px, py] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) { ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(70,70,66,0.5)';
    ctx.strokeRect(4, 4, w - 8, h - 8);
  } else if (style === 'cracked') {             // light shining through cracks: "this can break"
    ctx.strokeStyle = 'rgba(200,200,190,0.55)';
    ctx.lineWidth = 1.2;
    let x = w * rng.realInRange(0.3, 0.7), y = 0;
    ctx.beginPath(); ctx.moveTo(x, y);
    while (y < h) { x += rng.realInRange(-w * 0.25, w * 0.25); y += rng.realInRange(h * 0.1, h * 0.25); ctx.lineTo(Math.max(1, Math.min(w - 1, x)), Math.min(h, y)); }
    ctx.stroke();
  } else if (style === 'gate') {                 // vertical bars
    ctx.strokeStyle = 'rgba(70,70,66,0.6)';
    ctx.lineWidth = 1;
    for (let x = 4; x < w - 2; x += 6) { ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, h - 2); ctx.stroke(); }
  } else if (style === 'crusher') {              // jagged teeth along the bottom
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x + 4, h + 4), ctx.lineTo(x + 8, h);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  soften(ctx, ctx.canvas.width, ctx.canvas.height);
  tex.refresh();
  return key;
}

/** Re-draw a canvas through a light blur (the soft Limbo edge). */
function soften(ctx, w, h) {
  const copy = document.createElement('canvas');
  copy.width = w; copy.height = h;
  copy.getContext('2d').drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.filter = `blur(${SOFTEN}px)`;
  ctx.drawImage(copy, 0, 0);
  ctx.filter = 'none';
}
