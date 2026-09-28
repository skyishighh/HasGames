// Player visuals: a soft, Limbo-style silhouette per role, animated procedurally from the snapshot
// state (movement, air, crouch, climb, brace, carry, plant, beam, dash). Purely cosmetic — the host's
// invisible hitbox does the physics — so real art could replace this later without touching it.
//
// Shapes are built from a few primitives: a smooth "bean" body along a bendable spine, tapered
// two-segment limbs, a big round head (Limbo proportions), and per-role features with secondary
// motion (hair, scarf, hood tip, cloak hem) that trail behind the movement.
import { ROLES } from '../roles.js';

const INK = 0x050505;
const SOFT_EDGE = 0.9;   // screen px: how far the soft rim extends past the silhouette

// Proportions per role (px). leg + torso + head ≈ hitbox height. Widths are full widths.
// limb: [thickness at the shoulder/hip, at the hand/foot].
const SHAPES = {
  scout:  { leg: 12, torso: 9,  headR: 7,   hipW: 7,  chestW: 8,  neckW: 4, arm: 10, legLimb: [2.8, 1.5],  armLimb: [2.1, 1.3] },
  warden: { leg: 15, torso: 19, headR: 7,   hipW: 12, chestW: 20, neckW: 8, arm: 20, legLimb: [6, 3.8],   armLimb: [5.5, 3.2] },
  weaver: { leg: 16, torso: 14, headR: 6.5, hipW: 8,  chestW: 10, neckW: 4, arm: 13, legLimb: [2.8, 1.6],  armLimb: [2.2, 1.4] },
  anchor: { leg: 14, torso: 16, headR: 7,   hipW: 13, chestW: 17, neckW: 7, arm: 14, legLimb: [5, 3.8],   armLimb: [4.6, 3.6] },
};

/**
 * Two-bone IK: from joint A (hip/shoulder) towards target B, with bones l1 and l2, returns
 * [middle joint x, y, end x, y]. bend (+1/-1) chooses which side the knee/elbow points to.
 * An out-of-reach target is approached as far as the bones allow (limb straightens).
 */
function ik(ax, ay, bx, by, l1, l2, bend) {
  let dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy) || 0.001;
  const d = Math.min(Math.max(dist, Math.abs(l1 - l2) + 0.01), (l1 + l2) * 0.999);
  dx /= dist; dy /= dist;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // perpendicular (+x when the limb points straight down, so bend = +1 → knee towards +x)
  const px = -dy, py = dx;
  return [ax + dx * a - px * h * bend, ay + dy * a - py * h * bend, ax + dx * d, ay + dy * d];
}

export class PlayerView {
  constructor(scene, name, isLocal) {
    this.scene = scene;
    this.soft = scene.add.graphics().setDepth(2.9).setAlpha(0.28);
    this.gfx = scene.add.graphics().setDepth(3);
    this.label = scene.add.text(0, 0, name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: isLocal ? '#eeeeee' : '#bbbbbb',
    }).setOrigin(0.5, 1).setDepth(3);
    this.x = 0;
    this.y = 0;
    this.phase = 0;        // walk / climb cycle
    this.vx = 0;           // smoothed on-screen velocity
    this.vy = 0;
    this.last = null;      // { x, y, t }
    this.lastState = null;
    this.wasAir = false;
    this.land = 0;         // 1 right after landing, decays to 0 (squash)
    this.trail = 0;        // secondary motion: how far hair/cloak/hood tips lag behind (px, signed)
  }

  /** s: player snapshot — x = centre, y = feet. */
  applyState(s) {
    const now = performance.now();
    const moved = this.last ? Math.abs(s.x - this.last.x) : 0;       // distance travelled this frame
    const climbed = this.last ? Math.abs(s.y - this.last.y) : 0;
    let dt = 1 / 60;
    if (this.last) {
      dt = Math.min(0.1, Math.max(1, now - this.last.t) / 1000);
      this.vx += ((s.x - this.last.x) / dt - this.vx) * 0.35;
      this.vy += ((s.y - this.last.y) / dt - this.vy) * 0.35;
    }
    this.last = { x: s.x, y: s.y, t: now };
    this.lastState = s;
    this.x = s.x;
    this.y = s.y;

    const r = ROLES[s.role] ?? ROLES.scout;
    const speed = Math.abs(this.vx);
    const air = Math.abs(this.vy) > 40 && !s.climb && !s.ride;
    if (this.wasAir && !air) this.land = Math.min(1, Math.abs(this.vy) / 500 + 0.5);
    this.wasAir = air;
    this.land = Math.max(0, this.land - dt * 5);
    // Tips trail opposite to the motion (and lift a little when falling); eased like a spring.
    const trailTarget = Phaser.Math.Clamp(-this.vx * 0.03, -9, 9);
    this.trail += (trailTarget - this.trail) * Math.min(1, dt * 8);

    // Advance the walk cycle by distance travelled (one stride ≈ 55 px), so feet don't slide at any fps.
    if (s.climb) this.phase += climbed * (Math.PI * 2 / 40);
    else if (!air && moved < 60) this.phase += moved * (Math.PI * 2 / 55);

    const pose = {
      k: SHAPES[s.role] ?? SHAPES.scout, f: s.facing === -1 ? -1 : 1, speed, air,
      crouch: !!s.crouch, swing: Math.min(1, speed / r.speed) * (s.sprint ? 0.95 : 0.7), maxSpeed: r.speed,
      rising: air && this.vy < -60, time: now / 1000,
    };

    // Soft edge (Limbo's play layer is never razor-sharp): the figure is drawn 4 extra times, shifted
    // by under a pixel, into a faint "soft" graphics underneath the main one. Much cheaper than a
    // per-object blur filter, and it also gives the eyes a slight glow.
    this.soft.clear();
    this.gfx.clear();
    const o = SOFT_EDGE / this.scene.cameras.main.zoom;
    const passes = [[this.soft, -o, 0], [this.soft, o, 0], [this.soft, 0, -o], [this.soft, 0, o], [this.gfx, 0, 0]];
    let top = s.y;
    for (const [g, dx, dy] of passes) top = this.#drawFigure(g, dx || dy ? { ...s, x: s.x + dx, y: s.y + dy } : s, pose);
    this.label.setPosition(s.x, top - 6);
  }

  /** Draws one full figure; returns the y of the top of the head (for the name label). */
  #drawFigure(g, s, p) {
    const { k, f, air, crouch, swing } = p;
    g.fillStyle(INK, 1);

    // --- skeleton (squash on landing, stretch while rising, breathing when idle) ---
    const squash = 1 - 0.2 * this.land, stretch = p.rising ? 1.07 : 1;
    const breath = !air && p.speed < 10 ? Math.sin(p.time * 2.2) * 0.5 : 0;
    // Legs are two fixed-length bones; the hip height sets how much the knees bend (IK below).
    const thigh = k.leg * 0.53, shin = k.leg * 0.53;
    const bob = !air && !s.climb && !s.planted ? -Math.abs(Math.sin(this.phase)) * 1.2 * swing : 0;   // rise at passing
    const hipH = k.leg * (crouch ? 0.6 : s.planted ? 0.84 : 0.95) * (1 - 0.14 * this.land);
    const legLen = hipH;
    const hipX = s.x, hipY = s.y - hipH - (air ? 2 : 0) + bob;
    const lean = crouch ? 0.9 : Math.min(0.35, p.speed / p.maxSpeed * 0.25) + (s.dash ? 0.5 : 0);
    const torsoH = k.torso * (crouch ? 0.6 : 1) * squash * stretch;
    const neckX = hipX + f * lean * torsoH * 0.7, neckY = hipY - torsoH + breath;
    const R = k.headR;
    const headX = neckX + f * (crouch ? 3 : 1), headY = neckY - R * 0.85;
    const widen = 1 + 0.12 * this.land;

    // --- behind the body: cloak, anchor on the back ---
    if (s.role === 'weaver') this.#cloak(g, s, p, hipX, hipY, neckX, neckY);
    if (s.role === 'anchor' && !s.planted) this.#anchorOnBack(g, neckX, neckY, hipY, f);

    // --- legs: pick where each foot is, IK finds the knee (always bending forward) ---
    const heavy = s.role === 'warden' || s.role === 'anchor';
    const footL = k.legLimb[1] * (heavy ? 2.6 : 2.3);
    for (const off of [0, Math.PI]) {
      const hx = hipX + (off ? -1 : 1) * k.hipW * 0.2;
      const ph = this.phase + off;
      let ax, ay, toe;                                   // ankle target, toe angle (0 = flat, + = toes down)
      if (s.planted) { ax = hx + (off ? -1 : 1) * f * legLen * 0.55; ay = s.y; toe = 0; }
      else if (air) {
        ax = hx + (off ? -0.35 : 0.3) * f * legLen; ay = hipY + legLen * (p.rising ? 0.55 : 0.8) + (off ? 1 : -2);
        toe = 0.6;
      } else if (s.climb) { ax = hx; ay = s.y - Math.max(0, Math.sin(ph)) * legLen * 0.45; toe = 0.4; }
      else {
        // walk cycle: forward swing with the foot lifted, then the planted foot slides back
        const stride = legLen * (s.sprint ? 0.75 : 0.55) * (swing > 0.05 ? 1 : 0);
        const lift = Math.max(0, Math.cos(ph)) * legLen * (s.sprint ? 0.45 : 0.3) * Math.min(1, swing * 1.6);
        ax = hx + Math.sin(ph) * stride * f; ay = s.y - lift;
        toe = lift > 1 ? 0.25 + Math.sin(ph) * 0.35 : 0;     // heel-strike / toe-off
      }
      ay = Math.min(ay, s.y);
      const [kx, ky, ex, ey] = ik(hx, hipY, ax, ay, thigh, shin, f);            // knees point forward
      this.#limb(g, [[hx, hipY], [kx, ky], [ex, ey]], [k.legLimb[0], k.legLimb[1]]);
      // foot: from the ankle forward; flat on the ground, tipped when lifted
      const tx = ex + Math.cos(toe) * footL * f, ty = Math.min(s.y, ey + Math.sin(toe) * footL);
      this.#limb(g, [[ex, ey], [tx, ty]], [k.legLimb[1] * (heavy ? 1.15 : 1.2), k.legLimb[1] * (heavy ? 1.0 : 0.9)]);
    }

    // --- body: a smooth bean from the hips to the neck ---
    this.#bean(g, hipX, hipY + 1, neckX, neckY, k.hipW * widen, k.chestW * widen, k.neckW);

    // --- arms: pick where the hand is, IK finds the elbow (the far arm first, a touch thinner) ---
    const shY = neckY + torsoH * 0.12;
    const upper = k.arm * 0.52, fore = k.arm * 0.52;
    for (const side of [-f, f]) {
      const shX = neckX + side * k.chestW * 0.3;
      let hx, hy, elbow = -f;                                 // elbows point backwards by default
      if (s.brace || s.carry) { hx = shX + side * 3; hy = shY - k.arm * 0.9; elbow = side; }            // arms up, elbows out
      else if (s.climb) { const up = Math.sin(this.phase + (side > 0 ? 0 : Math.PI)); hx = shX + f * 2; hy = shY - k.arm * (0.45 + 0.4 * up); elbow = side; }
      else if (Array.isArray(s.beam) && side === f) {                                                   // reach along the beam
        const [, , bx, by] = s.beam; const a = Math.atan2(by - shY, bx - shX);
        hx = shX + Math.cos(a) * k.arm * 0.97; hy = shY + Math.sin(a) * k.arm * 0.97;
      } else if (air) { hx = shX + side * k.arm * 0.4; hy = shY - k.arm * (p.rising ? 0.55 : 0.1); elbow = side; }
      else {
        // swing opposite to the legs; the forward arm bends more (a sprint pumps hard at the elbow)
        const a = Math.sin(this.phase + (side === f ? Math.PI : 0)) * swing * 0.9 + (s.role === 'warden' ? 0.08 * f : 0);
        const reach = k.arm * (0.9 - (a * f > 0 ? a * f * (s.sprint ? 0.5 : 0.3) : 0)) * (crouch ? 0.8 : 1);
        hx = shX + Math.sin(a) * reach * f; hy = shY + Math.cos(a) * reach;
      }
      const [ex, ey, wx, wy] = ik(shX, shY, hx, hy, upper, fore, elbow);
      const far = side !== f ? 0.85 : 1;
      this.#limb(g, [[shX, shY], [ex, ey], [wx, wy]], [k.armLimb[0] * far, k.armLimb[1] * far]);
      // hand: a small shape continuing past the wrist
      const hl = Math.hypot(wx - ex, wy - ey) || 1, dxh = (wx - ex) / hl, dyh = (wy - ey) / hl;
      const handR = k.armLimb[1] * (s.role === 'warden' ? 0.72 : 0.62);
      g.fillCircle(wx + dxh * handR * 0.9, wy + dyh * handR * 0.9, handR);
      if (s.role === 'weaver' && (!s.ab || s.ab.includes('beam'))) this.#glowHand(g, wx + dxh * handR, wy + dyh * handR, s.energy);
    }

    // --- head and role features ---
    this.#head(g, s, p, headX, headY, R);
    if (s.role === 'anchor' && s.planted) this.#anchorPlanted(g, s, neckY, f);
    return headY - R - (s.role === 'scout' ? 5 : 2);
  }

  // ------------------------------------------------------------------ primitives

  /** Tapered limb through points; w = [thickness at the start, at the end]; rounded joints. */
  #limb(g, pts, [w0, w1]) {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const wa = (w0 + (w1 - w0) * (i / n)) / 2, wb = (w0 + (w1 - w0) * ((i + 1) / n)) / 2;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      g.fillPoints([
        { x: x1 + nx * wa, y: y1 + ny * wa }, { x: x2 + nx * wb, y: y2 + ny * wb },
        { x: x2 - nx * wb, y: y2 - ny * wb }, { x: x1 - nx * wa, y: y1 - ny * wa },
      ], true);
      g.fillCircle(x2, y2, wb);
    }
    g.fillCircle(pts[0][0], pts[0][1], w0 / 2);
  }

  /** Smooth body: width eases from the hips to a wide chest and narrows at the neck. */
  #bean(g, hx, hy, nx, ny, hipW, chestW, neckW) {
    const steps = 8, left = [], right = [];
    const dx = nx - hx, dy = ny - hy, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // hips → chest (t 0..0.7) → neck (0.7..1), with rounded curves
      const w = t < 0.7 ? hipW + (chestW - hipW) * Math.sin((t / 0.7) * Math.PI / 2)
        : chestW + (neckW - chestW) * (1 - Math.cos(((t - 0.7) / 0.3) * Math.PI / 2));
      const cx = hx + dx * t, cy = hy + dy * t;
      left.push({ x: cx + px * w / 2, y: cy + py * w / 2 });
      right.push({ x: cx - px * w / 2, y: cy - py * w / 2 });
    }
    g.fillPoints([...left, ...right.reverse()], true);
    g.fillEllipse(hx, hy, hipW, hipW * 0.6);                    // rounded bottom
    g.fillEllipse(hx + dx * 0.72, hy + dy * 0.72, chestW, chestW * 0.55); // rounded shoulders
  }

  // ------------------------------------------------------------------ heads & features

  #head(g, s, p, x, y, R) {
    const { f } = p, trail = this.trail;
    g.fillStyle(INK, 1);
    if (s.role === 'warden' || s.role === 'weaver') {
      // Rounded hood, a little bigger than the head; its soft tip droops down the back and trails.
      const hr = R * (s.role === 'warden' ? 1.2 : 1.15);
      g.fillCircle(x - f * 0.8, y - 0.3, hr);
      const bx = x - f * hr * 0.7, by = y - hr * 0.55;
      const tipX = x - f * hr * 1.15 + trail * 0.5, tipY = y + hr * 1.35 - Math.abs(trail) * 0.2;   // droops down the back
      g.fillTriangle(bx, by, x - f * hr * 0.2, y + hr * 0.6, tipX, tipY);
      g.fillCircle(tipX, tipY, 1.2);
    } else {
      g.fillEllipse(x, y, R * 2, R * 2.05);
    }
    if (s.role === 'scout') this.#hair(g, x, y, R, f, p);
    if (s.role === 'anchor') {                                   // knit cap with a folded brim
      g.fillEllipse(x - f * 0.5, y - R * 0.55, R * 2.15, R * 1.25);
      g.fillCircle(x - f * R * 0.6 + trail * 0.2, y - R * 1.2, 1.8);
    }
    // Limbo-style glowing eyes (inside the hood for the hooded roles)
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x + f * R * 0.45, y - R * 0.05, 1.35);
    g.fillCircle(x + f * R * 0.05, y, 1.1);
    g.fillStyle(INK, 1);
  }

  /** Scout: messy hair strands swept back, plus a scarf end that flutters. */
  #hair(g, x, y, R, f, p) {
    const trail = this.trail, t = p.time;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 - f * (0.1 + i * 0.28);              // around the top-back of the head
      const bx = x + Math.cos(a) * R * 0.85, by = y + Math.sin(a) * R * 0.85;
      const len = 4 + (i % 2 ? 1.5 : 3);
      const tx = bx + Math.cos(a - f * 0.5) * len + trail * 0.35 + Math.sin(t * 7 + i) * 0.4;
      const ty = by + Math.sin(a - f * 0.5) * len + (p.air ? -1 : 0.5);
      const nx = -Math.sin(a) * 1.3, ny = Math.cos(a) * 1.3;
      g.fillTriangle(bx - nx, by - ny, bx + nx, by + ny, tx, ty);
    }
    // scarf: a short strip from the neck that trails and ripples
    const sx = x - f * R * 0.4, sy = y + R * 0.95;
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const u = i / 4;
      pts.push([sx - f * u * 7 + trail * u * 0.9, sy + u * 3 + Math.sin(t * 9 - u * 4) * u * 1.4]);
    }
    this.#limb(g, pts, [3, 1.4]);
  }

  /** Weaver: long cloak from the shoulders to near the feet; the hem ripples and trails behind. */
  #cloak(g, s, p, hipX, hipY, neckX, neckY) {
    const { f } = p, t = p.time, trail = this.trail;
    const flare = Math.min(1, p.speed / p.maxSpeed) * 8 + (p.air ? 5 : 0);
    const pts = [{ x: neckX + f * 3, y: neckY + 1 }];             // front shoulder
    const hemY = s.y - 3;
    for (let i = 0; i <= 5; i++) {                               // hem, front → back
      const u = i / 5;
      pts.push({
        x: hipX + f * 5 - f * u * (10 + flare) + trail * u * 0.8,
        y: hemY - u * (p.air ? 6 : 2) + Math.sin(t * 6 - u * 5) * (0.8 + u * 1.4),
      });
    }
    pts.push({ x: neckX - f * 4, y: neckY + 2 });                 // back shoulder
    g.fillPoints(pts, true);
  }

  /** Weaver's hands: a soft white glow whose strength shows the remaining light energy. */
  #glowHand(g, x, y, energy) {
    const e = (energy ?? 100) / 100;
    g.fillStyle(0xffffff, 0.12 * e).fillCircle(x, y, 6);
    g.fillStyle(0xffffff, 0.25 + 0.3 * e).fillCircle(x, y, 3.2);
    g.fillStyle(0xffffff, 0.5 + 0.5 * e).fillCircle(x, y, 1.6);
    g.fillStyle(INK, 1);
  }

  /** A proper anchor: ring, crossbar (stock), shank, curved arms with pointed flukes. */
  #anchorShape(g, x, top, bottom, scale = 1) {
    const w = 7 * scale;
    g.lineStyle(2.4 * scale, INK, 1);
    g.strokeCircle(x, top, 2 * scale);                          // ring
    g.lineBetween(x, top + 2 * scale, x, bottom);                 // shank
    g.lineBetween(x - w * 0.8, top + 5 * scale, x + w * 0.8, top + 5 * scale);   // stock
    g.beginPath(); g.arc(x, bottom - w, w, 0.25, Math.PI - 0.25, false); g.strokePath();  // arms
    const ay = bottom - w + Math.sin(0.25) * w;
    for (const side of [-1, 1]) {                                 // flukes
      const ax = x + side * Math.cos(0.25) * w;
      g.fillTriangle(ax - 2 * scale, ay + 1, ax + 2 * scale, ay + 1, ax + side * 2.5 * scale, ay - 4 * scale);
    }
    g.fillStyle(INK, 1);
  }

  #anchorOnBack(g, neckX, neckY, hipY, f) {
    this.#anchorShape(g, neckX - f * 7, neckY - 4, hipY + 6, 0.95);
  }

  #anchorPlanted(g, s, neckY, f) {
    this.#anchorShape(g, s.x + f * 15, neckY - 2, s.y + 7, 1.1);   // driven into the ground in front
  }

  destroy() { this.soft.destroy(); this.gfx.destroy(); this.label.destroy(); }
}
