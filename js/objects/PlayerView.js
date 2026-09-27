// Player visuals: a jointed, hand-drawn-looking silhouette per role, animated procedurally from the
// snapshot state (movement, air, crouch, climb, brace, carry, plant, beam). Purely cosmetic — the
// host's invisible hitbox does the physics — so real art can replace this later without touching it.
import { ROLES } from '../roles.js';

const INK = 0x050505;
const SOFT_EDGE = 0.9;   // screen px: how far the soft rim extends past the silhouette

// Body proportions per role (in px). legs + torso + head ≈ hitbox height.
const SHAPES = {
  scout:  { leg: 13, torso: 10, headR: 6.5, hip: 3, shoulder: 5, limb: 2.4, arm: 11 },
  warden: { leg: 16, torso: 18, headR: 7.5, hip: 7, shoulder: 12, limb: 5,   arm: 17 },
  weaver: { leg: 16, torso: 14, headR: 6,   hip: 3, shoulder: 5, limb: 2.4, arm: 13 },
  anchor: { leg: 15, torso: 15, headR: 7,   hip: 5, shoulder: 9, limb: 4,   arm: 14 },
};

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
  }

  /** s: player snapshot — x = centre, y = feet. */
  applyState(s) {
    const now = performance.now();
    const moved = this.last ? Math.abs(s.x - this.last.x) : 0;       // distance travelled this frame
    const climbed = this.last ? Math.abs(s.y - this.last.y) : 0;
    if (this.last) {
      const dt = Math.max(1, now - this.last.t) / 1000;
      this.vx += ((s.x - this.last.x) / dt - this.vx) * 0.35;
      this.vy += ((s.y - this.last.y) / dt - this.vy) * 0.35;
    }
    this.last = { x: s.x, y: s.y, t: now };
    this.x = s.x;
    this.y = s.y;

    const r = ROLES[s.role] ?? ROLES.scout;
    const k = SHAPES[s.role] ?? SHAPES.scout;
    const f = s.facing === -1 ? -1 : 1;
    const speed = Math.abs(this.vx);
    const air = Math.abs(this.vy) > 40 && !s.climb && !s.ride;
    const crouch = !!s.crouch;

    // Advance the walk cycle by distance travelled (one stride ≈ 55 px), so feet don't slide at any fps.
    if (s.climb) this.phase += climbed * (Math.PI * 2 / 40);
    else if (!air && moved < 60) this.phase += moved * (Math.PI * 2 / 55);
    const swing = Math.min(1, speed / r.speed) * (s.sprint ? 0.95 : 0.7);

    // Soft edge (Limbo's play layer is never razor-sharp): the figure is drawn 4 extra times, shifted
    // by under a pixel, into a faint "soft" graphics underneath the main one. Much cheaper than a
    // per-object blur filter, and it also gives the eyes a slight glow.
    this.soft.clear();
    this.gfx.clear();
    const base = s;
    let labelY = 0;
    const o = SOFT_EDGE / this.scene.cameras.main.zoom;           // shift in world px = SOFT_EDGE screen px
    const passes = [[this.soft, -o, 0], [this.soft, o, 0], [this.soft, 0, -o], [this.soft, 0, o], [this.gfx, 0, 0]];
    for (const [g, dx, dy] of passes) {
      const s = dx || dy ? { ...base, x: base.x + dx, y: base.y + dy } : base;
      g.fillStyle(INK, 1);

      // --- skeleton ---
      const legLen = k.leg * (crouch ? 0.55 : 1);
      const hipY = s.y - legLen - (air ? 2 : 0);
      const lean = crouch ? 0.9 : Math.min(0.35, speed / r.speed * 0.25) + (s.dash ? 0.5 : 0);
      const torsoTopX = s.x + f * lean * k.torso * 0.6;
      const torsoTopY = hipY - k.torso * (crouch ? 0.55 : 1);
      const headX = torsoTopX + f * (crouch ? 4 : 1);
      const headY = torsoTopY - k.headR * 0.9;

      // --- legs ---
      const legs = [0, Math.PI];
      for (const off of legs) {
        let a1, bend;
        if (s.planted) { a1 = (off ? -1 : 1) * 0.45; bend = 0.15; }
        else if (air) { a1 = (off ? 0.5 : -0.2) * f; bend = 0.9; }
        else if (s.climb) { a1 = Math.sin(this.phase + off) * 0.35; bend = 0.6; }
        else { a1 = Math.sin(this.phase + off) * swing * f; bend = crouch ? 1.4 : Math.max(0, Math.cos(this.phase + off)) * swing * 1.1 + 0.08; }
        const hipX = s.x + (off ? -1 : 1) * (k.hip * 0.5 + k.limb * 0.4); // spaced so both legs read
        const kx = hipX + Math.sin(a1) * legLen * 0.5, ky = hipY + Math.cos(a1) * legLen * 0.5;
        const a2 = a1 - bend * f;
        const fx = kx + Math.sin(a2) * legLen * 0.5, fy = Math.min(s.y, ky + Math.cos(a2) * legLen * 0.5);
        this.#limb(g, hipX, hipY, kx, ky, fx, fy, k.limb * (s.role === 'anchor' ? 1.1 : 1));
        if (s.role === 'anchor' || s.role === 'warden') g.fillEllipse(fx + f * 2, fy - 1, k.limb * 2.6, k.limb * 1.4); // heavy boots
      }

      // --- torso ---
      const sw = k.shoulder, hw = k.hip;
      g.fillPoints([
        { x: s.x - hw, y: hipY + 2 }, { x: s.x + hw, y: hipY + 2 },
        { x: torsoTopX + sw, y: torsoTopY + 2 }, { x: torsoTopX - sw, y: torsoTopY + 2 },
      ], true);
      // round the silhouette: chest and hips as ellipses instead of hard corners
      g.fillEllipse(torsoTopX, torsoTopY + 4, sw * 2.1, 9);
      g.fillEllipse(s.x, hipY, hw * 2 + 2, 6);
      if (s.role === 'weaver') {                                     // cloak flaring behind while moving
        const flare = Math.min(1, speed / r.speed) * 10 + (air ? 6 : 0);
        g.fillTriangle(torsoTopX - f * 2, torsoTopY + 2, s.x - f * (6 + flare), s.y - 2, s.x + f * 4, hipY + 6);
      }
      if (s.role === 'anchor') this.#anchorProp(g, s, torsoTopX, torsoTopY, hipY, f);

      // --- arms ---
      const shY = torsoTopY + 3;
      for (const side of [-1, 1]) {
        const shX = torsoTopX + side * sw * 0.8;
        let hx, hy;
        if (s.brace || s.carry) { hx = shX + side * 2; hy = shY - k.arm; }                         // arms up
        else if (s.climb) { const up = Math.sin(this.phase + (side > 0 ? 0 : Math.PI)); hx = shX; hy = shY - k.arm * (0.6 + 0.4 * up); }
        else if (Array.isArray(s.beam) && side === f) {                                           // point along the beam
          const [, , bx, by] = s.beam; const a = Math.atan2(by - shY, bx - shX);
          hx = shX + Math.cos(a) * k.arm; hy = shY + Math.sin(a) * k.arm;
        } else if (air) { hx = shX + side * k.arm * 0.5; hy = shY - k.arm * 0.4; }
        else { const a = Math.sin(this.phase + (side === f ? Math.PI : 0)) * swing * 0.9; hx = shX + Math.sin(a) * k.arm * f; hy = shY + Math.cos(a) * k.arm * (crouch ? 0.7 : 1); }
        const ex = (shX + hx) / 2 + side * 1.5, ey = (shY + hy) / 2 + 2;
        this.#limb(g, shX, shY, ex, ey, hx, hy, k.limb * 0.85);
        if (s.role === 'weaver' && (!s.ab || s.ab.includes('beam'))) {                           // glowing hands = light energy
          g.fillStyle(0xffffff, 0.15 + 0.8 * ((s.energy ?? 100) / 100)).fillCircle(hx, hy, 2.6);
          g.fillStyle(INK, 1);
        }
      }

      // --- head ---
      this.#head(g, s.role, headX, headY, k.headR, f);
      labelY = headY - k.headR - 6;
    }
    this.label.setPosition(base.x, labelY);
  }

  /** Two-segment limb with rounded joints (a hand-drawn line look). */
  #limb(g, x1, y1, x2, y2, x3, y3, w) {
    g.lineStyle(w, INK, 1).lineBetween(x1, y1, x2, y2).lineBetween(x2, y2, x3, y3);
    g.fillCircle(x2, y2, w / 2).fillCircle(x3, y3, w / 2);
  }

  #head(g, role, x, y, R, f) {
    g.fillStyle(INK, 1);
    if (role === 'warden' || role === 'weaver') {                 // hooded
      g.fillEllipse(x, y, R * 2.2, R * 2.3);
      // pointed hood peak trailing back, plus a drape over the shoulders
      g.fillTriangle(x - f * R * 0.1, y - R * 1.15, x - f * R * 2.1, y - R * 0.7, x + f * R * 0.3, y - R * 0.5);
      g.fillTriangle(x - f * R * 1.1, y - R * 0.2, x + f * R * 0.6, y + R * 0.6, x - f * R * 1.3, y + R * 1.4);
    } else {
      g.fillEllipse(x, y, R * 2, R * 2.1);
    }
    if (role === 'scout') {                                        // messy hair tufts
      for (let i = -2; i <= 2; i++) g.fillTriangle(x + i * 2.4 - 1.5, y - R * 0.6, x + i * 2.4 + 1.5, y - R * 0.6, x + i * 2.4 - f * 2, y - R - 3 - (i % 2 ? 1 : 3));
    }
    // Limbo-style glowing eyes
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x + f * R * 0.45, y - R * 0.1, 1.3);
    g.fillCircle(x + f * R * 0.05, y - R * 0.05, 1.1);
  }

  #anchorProp(g, s, tx, ty, hipY, f) {
    g.lineStyle(3, INK, 1);
    if (s.planted) {                                               // driven into the ground in front
      const ax = s.x + f * 14;
      g.lineBetween(ax, ty - 2, ax, s.y + 8);
      g.fillTriangle(ax - 7, s.y + 4, ax + 7, s.y + 4, ax, s.y + 12);
      g.lineBetween(ax - 6, ty + 4, ax + 6, ty + 4);
    } else {                                                       // carried on the back
      const ax = tx - f * 8;
      g.lineBetween(ax, ty - 4, ax, hipY + 6);
      g.lineBetween(ax - 5, ty + 1, ax + 5, ty + 1);
      g.lineStyle(2.5, INK, 1);
      g.beginPath(); g.arc(ax, hipY + 2, 6, 0.2, Math.PI - 0.2, false); g.strokePath();
    }
    g.fillStyle(INK, 1);
  }

  destroy() { this.soft.destroy(); this.gfx.destroy(); this.label.destroy(); }
}
