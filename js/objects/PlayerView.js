// Player visuals: a soft, Limbo-style silhouette per role, animated procedurally from the snapshot
// state (movement, air, crouch, climb, brace, carry, plant, beam, dash). Purely cosmetic — the host's
// invisible hitbox does the physics — so real art could replace this later without touching it.
//
// Shapes are built from a few primitives: a smooth "bean" body along a bendable spine, tapered
// two-segment limbs, a big round head (Limbo proportions), and per-role features with secondary
// motion (hair, scarf, hood tip, cloak hem) that trail behind the movement.
import { ROLES } from '../roles.js';
import { CutoutRig, hasCutout } from '../art/CutoutRig.js';

const INK = 0x050505;
const RIM = 0x8a8a86;      // thin light outline between overlapping black shapes (Warden's near arm)
const SOFT_EDGE = 0.9;   // screen px: how far the soft rim extends past the silhouette
const ANIM_RATE = 0.6;   // animation speed: < 1 = legs cycle less often per distance (slower, calmer cadence)

// Proportions per role (px). leg + torso + head ≈ hitbox height. Widths are full widths.
// limb: [thickness at the shoulder/hip, at the hand/foot].
const SHAPES = {
  scout:  { leg: 15, torso: 8,  headR: 6,   hipW: 7,  chestW: 8,  neckW: 4, arm: 10, legLimb: [2.8, 1.5],  armLimb: [2.1, 1.3] },
  // Warden (docs/reference/poses/warden_design.png): gentle giant — barrel chest, small head set
  // forward and low in front of the shoulders, long heavy arms to the knees, sturdy legs.
  warden: { leg: 17.5, torso: 17.3, headR: 5.2, hipW: 10, chestW: 18, neckW: 7, arm: 18.6, legLimb: [7.5, 4.6], armLimb: [7, 4.2], headFwd: 2, headDrop: 5, shoulderY: 0.24, chestBulge: 4, stand: 1.04, shoulderX: 0.02, armHang: 0.98, armFwd: 0.2, handScale: 0.55, armRim: 0.45 },
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

// ---------------------------------------------------------------------------------------- key poses
// Poses copied from the pose sheets in docs/reference/poses/ (drawn facing right, then mirrored).
// Units: L = full leg length (hip to ankle), A = full arm length.
//   hip   : hip height above the feet (in L)          lean : torso tilt forward (radians)
//   legs  : [x fwd, y, toe] per leg — y is the lift above the ground (ground poses) or the drop
//           below the hip (air poses); toe: 0 flat, + toes pointing down
//   arms  : [x fwd, y down, elbow] per arm, hand position from the shoulder; elbow -1 back, +1 fwd
// Walk and run are cycles of four keys (contact, passing, contact, passing) per leg; the other leg
// is half a cycle behind. "cycle" = distance travelled per full cycle (in L), so feet never slide.
const KEYS = {
  scout: {
    idle:    { hip: 0.97, lean: 0.03, ground: true, legs: [[0.08, 0, 0], [-0.05, 0, 0]], arms: [[-0.03, 0.97, -1], [0.04, 0.97, -1]] },
    // Default movement is a JOG: bouncy, arms bent ~90°, a little lean, a short flight phase
    // (both feet off the ground between steps: the ground phase covers only 0–0.4 of each leg's cycle).
    walk: {
      cycle: 2.0, lean: 0.2, hip: [0.88, 0.99],
      leg: [[0, [0.42, 0, -0.2]], [0.2, [0.05, 0, 0]], [0.4, [-0.38, 0.04, 0.7]], [0.65, [-0.3, 0.38, 1.1]], [0.85, [0.28, 0.3, 0.4]]],
      arm: [[0, [-0.3, 0.52, -1]], [0.5, [0.32, 0.42, -1]]],
    },
    // SPRINT: strong lean, long strides, heels kick up high, big arm pumps up to the face.
    run: {
      cycle: 3.1, lean: 0.48, hip: [0.84, 0.97],
      leg: [[0, [0.55, 0, -0.3]], [0.18, [0.05, 0, 0]], [0.35, [-0.55, 0.08, 0.85]], [0.6, [-0.35, 0.62, 1.35]], [0.82, [0.45, 0.5, 0.5]]],
      arm: [[0, [-0.5, 0.42, -1]], [0.5, [0.45, 0.12, -1]]],
    },
    // CROUCH-WALK: low, short steps.
    crouchWalk: {
      cycle: 0.9, lean: 0.5, hip: [0.43, 0.47],
      leg: [[0, [0.25, 0, 0]], [0.5, [-0.2, 0, 0.3]], [0.75, [0.02, 0.16, 0.4]]],
      arm: [[0, [0.25, 0.85, -1]], [0.5, [0.38, 0.8, -1]]],
    },
    rise:    { hip: 0.93, lean: 0.18, legs: [[0.2, 0.68, 0.45], [-0.28, 0.8, 0.8]], arms: [[-0.35, 0.65, -1], [0.2, 0.7, -1]] },
    fall:    { hip: 0.98, lean: -0.03, legs: [[0.06, 0.95, 0.8], [-0.08, 0.93, 0.8]], arms: [[-0.4, 0.55, -1], [0.42, 0.52, -1]] },
    // WALL (sheet scout_wall): grab → slide while clinging (drawn facing the wall), then a quick coil
    // ("crouch to jump", still facing the wall) and the push-off facing away. The wall surface is
    // about half a hitbox in front of the hip: hands and feet stop just short of it so they stay visible.
    wallGrab:   { hip: 0.9, lean: 0.05, legs: [[0.3, 0.55, -1.2], [-0.15, 0.95, 0.9]], arms: [[0.42, -0.35, -1], [0.4, -0.22, -1]] },
    wallSlide:  { hip: 0.9, lean: -0.15, legs: [[0.32, 0.5, -1.2], [0.34, 0.85, -1.3]], arms: [[0.5, -0.9, -1], [0.58, 0.15, -1]] },
    wallCoil:   { hip: 0.78, lean: 0.1, legs: [[0.26, 0.35, -1.2], [0.3, 0.55, -1.3]], arms: [[0.4, 0.05, -1], [0.42, -0.2, -1]] },
    kick:       { hip: 0.9, lean: 0.45, legs: [[0.25, 0.45, 0.9], [-0.95, 0.35, 0.6]], arms: [[0.6, -0.6, -1], [0.75, -0.4, -1]] },
    // Pulling a lever (sheet pose 10): feet braced, arms reach forward to grab, then lean back and pull.
    pullStart: { hip: 0.86, lean: 0.25, ground: true, legs: [[0.35, 0, 0], [-0.25, 0, 0.3]], arms: [[0.85, 0.2, -1], [0.92, 0.12, -1]] },
    pullEnd:   { hip: 0.8, lean: -0.35, ground: true, legs: [[0.48, 0, -0.15], [-0.3, 0, 0.25]], arms: [[0.55, 0.3, -1], [0.62, 0.22, -1]] },
    land:    { hip: 0.6, lean: 0.45, ground: true, legs: [[0.22, 0, 0], [-0.18, 0, 0.3]], arms: [[0.35, 0.8, -1], [0.5, 0.75, -1]] },
    // DASH (sheet scout_abilities, row 1): wind-up → launch → glide, then recover into the run.
    dashWind:   { hip: 0.55, lean: 0.4, ground: true, legs: [[0.22, 0, 0], [-0.32, 0, 0.4]], arms: [[-0.6, 0.35, -1], [-0.5, 0.5, -1]] },
    dashLaunch: { hip: 0.58, lean: 0.85, ground: true, legs: [[0.75, 0.04, -0.2], [-0.85, 0, 0.6]], arms: [[-0.95, -0.15, -1], [-0.9, 0.05, -1]] },
    dashGlide:  { hip: 0.9, lean: 0.8, legs: [[0.18, 0.5, 0.9], [-0.18, 0.46, 1.0]], arms: [[-0.95, -0.12, -1], [-0.9, 0.05, -1]] },
    dashRecover:{ hip: 0.92, lean: 0.3, ground: true, legs: [[0.5, 0, -0.2], [-0.5, 0.12, 0.8]], arms: [[-0.45, 0.45, -1], [0.4, 0.2, -1]] },
    // CLIMB on mesh (row 2): one hand reaches high while the other leg's knee comes up, pull,
    // then the other side; same-side hand and foot are half a cycle apart. "hang" when still.
    climb: {
      lean: -0.2, hip: [0.95, 0.95],
      leg: [[0, [0.05, 0.92, 0.7]], [0.25, [0.3, 0.62, 0.5]], [0.5, [0.48, 0.42, 0.2]], [0.75, [0.3, 0.62, 0.5]]],
      arm: [[0, [0.62, -0.72, -1]], [0.25, [0.8, -0.35, -1]], [0.5, [0.75, 0.15, -1]], [0.75, [0.8, -0.3, -1]]],
    },
    hang:    { hip: 0.95, lean: -0.2, legs: [[0.2, 0.82, 0.8], [0.05, 0.88, 0.8]], arms: [[0.7, -0.6, -1], [0.75, -0.5, -1]] },
    crouch:  { hip: 0.42, lean: 0.5, ground: true, legs: [[0.2, 0, 0], [-0.14, 0, 0.45]], arms: [[0.32, 0.85, -1], [0.42, 0.8, -1]] },
  },
  // WARDEN (docs/reference/poses/warden_movement.png): heavy, calm and powerful. Upright walk with a
  // long ground phase (never airborne), a lumbering forward-leaning run, low knee lifts.
  warden: {
    idle:    { hip: 0.98, lean: 0.04, ground: true, legs: [[0.12, 0, 0], [-0.1, 0, 0]], arms: [[-0.14, 0.95, -1], [0.1, 0.95, -1]] },
    walk: {
      cycle: 2.4, lean: 0.12, hip: [0.9, 0.97],
      leg: [[0, [0.42, 0, -0.15]], [0.25, [0.05, 0, 0]], [0.5, [-0.38, 0.03, 0.5]], [0.75, [0.05, 0.22, 0.6]]],
      arm: [[0, [-0.3, 0.85, -1]], [0.5, [0.32, 0.78, -1]]],
    },
    run: {
      cycle: 3.2, lean: 0.4, hip: [0.85, 0.95],
      leg: [[0, [0.6, 0, -0.2]], [0.2, [0.1, 0, 0]], [0.4, [-0.55, 0.1, 0.8]], [0.65, [-0.25, 0.45, 1.0]], [0.85, [0.35, 0.4, 0.5]]],
      arm: [[0, [-0.45, 0.55, -1]], [0.5, [0.5, 0.3, -1]]],
    },
    crouchWalk: {
      cycle: 0.8, lean: 0.3, hip: [0.55, 0.6],
      leg: [[0, [0.3, 0, 0]], [0.5, [-0.25, 0, 0.3]], [0.75, [0.02, 0.14, 0.4]]],
      arm: [[0, [0.3, 0.7, -1]], [0.5, [0.42, 0.66, -1]]],
    },
    rise:    { hip: 0.92, lean: 0.12, legs: [[0.22, 0.62, 0.5], [-0.22, 0.82, 0.8]], arms: [[0.4, 0.15, -1], [0.85, -0.3, -1]] },   // near arm forward at head height; far arm low, behind the body
    fall:    { hip: 0.95, lean: 0.15, legs: [[0.1, 0.8, 0.7], [-0.15, 0.85, 0.8]], arms: [[-0.2, 0.8, -1], [0.72, 0.62, -1]] },   // far arm down at the side, near arm reaching forward-down, almost straight (no fold)
    land:    { hip: 0.55, lean: 0.6, ground: true, legs: [[0.3, 0, 0], [-0.3, 0, 0.4]], arms: [[0.15, 0.85, -1], [0.5, 0.98, -1]] },
    crouch:  { hip: 0.55, lean: 0.25, ground: true, legs: [[0.35, 0, 0], [-0.3, 0, 0.3]], arms: [[0.35, 0.65, -1], [0.45, 0.6, -1]] },
    pullStart: { hip: 0.88, lean: 0.25, ground: true, legs: [[0.45, 0, 0], [-0.4, 0, 0.4]], arms: [[0.85, 0.2, -1], [0.9, 0.15, -1]] },
    pullEnd:   { hip: 0.82, lean: -0.25, ground: true, legs: [[0.55, 0, -0.2], [-0.35, 0, 0.3]], arms: [[0.6, 0.25, -1], [0.65, 0.2, -1]] },
    // ABILITIES (docs/reference/poses/warden_abilities.png)
    // Push: hands flat on the block, low and leaning in; the legs alternate as he walks it forward.
    pushA:   { hip: 0.75, lean: 0.75, ground: true, legs: [[0.35, 0, 0], [-0.85, 0, 0.6]], arms: [[0.8, 0.05, -1], [0.85, -0.05, -1]] },
    pushB:   { hip: 0.75, lean: 0.75, ground: true, legs: [[-0.6, 0, 0.5], [0.25, 0.12, 0.3]], arms: [[0.8, 0.05, -1], [0.85, -0.05, -1]] },
    // Lift: squat and grab the crate low in front, then stand up holding it overhead (arms straight up).
    liftGrab: { hip: 0.55, lean: 0.5, ground: true, legs: [[0.3, 0, 0], [-0.3, 0, 0.3]], arms: [[0.5, 0.95, -1], [0.65, 0.9, -1]] },
    carryArms: [[-0.12, -0.97, -1], [0.02, -0.97, -1]],
    // Brace: holding a crushing slab up, arms straight up, legs wide and bent.
    brace:   { hip: 0.72, lean: 0, ground: true, legs: [[0.45, 0, 0], [-0.45, 0, 0.1]], arms: [[-0.15, -0.96, -1], [0.05, -0.97, -1]] },
    // Smash: fists together high overhead → slammed onto the ground in front → straighten up.
    smashUp:   { hip: 0.9, lean: -0.2, ground: true, legs: [[0.35, 0, 0], [-0.35, 0, 0.3]], arms: [[-0.05, -0.97, -1], [0.02, -0.97, -1]] },
    smashDown: { hip: 0.55, lean: 0.85, ground: true, legs: [[0.42, 0, 0], [-0.35, 0, 0.4]], arms: [[0.6, 0.9, -1], [0.72, 0.85, -1]] },
    smashRec:  { hip: 0.95, lean: 0.15, ground: true, legs: [[0.15, 0, 0], [-0.12, 0, 0]], arms: [[0.0, 0.95, -1], [0.15, 0.92, -1]] },
    // Throw (a crate or a friend): wind back with the hand above the shoulder, then swing forward and up.
    tossBack: { hip: 0.9, lean: -0.15, ground: true, legs: [[0.45, 0, 0], [-0.45, 0, 0.4]], arms: [[0.45, 0.6, -1], [-0.35, -0.75, -1]] },
    tossOut:  { hip: 0.9, lean: 0.3, ground: true, legs: [[0.5, 0, 0], [-0.5, 0, 0.6]], arms: [[-0.4, 0.75, -1], [0.55, -0.82, -1]] },
  },
};

/** A pose with ground lifts converted to "drop below the hip", ready to blend. */
function resolve(p) {
  return {
    hip: p.hip, lean: p.lean,
    legs: p.legs.map(([x, y, t]) => [x, p.ground ? p.hip - y : y, t]),
    arms: p.arms.map((a) => [...a]),
  };
}

function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const l = (u, v) => u + (v - u) * t;
  const m = (p, q) => p.map((v, i) => l(v, q[i]));
  return { hip: l(a.hip, b.hip), lean: l(a.lean, b.lean), legs: a.legs.map((v, i) => m(v, b.legs[i])), arms: a.arms.map((v, i) => m(v, b.arms[i])) };
}

/** Value of a looping key track at t (0..1), smoothly interpolated. */
function track(keys, t) {
  t = ((t % 1) + 1) % 1;
  for (let i = 0; i < keys.length; i++) {
    const [t0, v0] = keys[i], [t1raw, v1] = keys[(i + 1) % keys.length];
    const t1 = i + 1 < keys.length ? t1raw : 1;
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0), e = u * u * (3 - 2 * u);        // smoothstep between keys
      return v0.map((v, j) => v + (v1[j] - v) * e);
    }
  }
  return keys[0][1];
}

/** Walk/run cycle pose at phase t (0..1). */
function cyclePose(c, t, hanging = false) {
  const bob = Math.abs(Math.sin(t * Math.PI * 2));                   // 0 at contact, 1 at passing
  const hip = c.hip[0] + (c.hip[1] - c.hip[0]) * bob;
  // ground cycles give foot lift; a hanging cycle (climb) gives the drop below the hip directly
  const legs = [track(c.leg, t), track(c.leg, t + 0.5)].map(([x, y, toe]) => [x, hanging ? y : hip - y, toe]);
  // near arm swings with the far leg and vice versa
  return { hip, lean: c.lean, legs, arms: [track(c.arm, t), track(c.arm, t + 0.5)] };
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
    this.dashDt = dt;
    this.lastState = s;
    this.x = s.x;
    this.y = s.y;

    const r = ROLES[s.role] ?? ROLES.scout;
    const speed = Math.abs(this.vx);
    // The physics' own ground contact (from the snapshot); older snapshots fall back to vertical speed.
    this.airT = (s.air ?? Math.abs(this.vy) > 40) ? (this.airT ?? 0) + dt : 0;
    const air = (this.airT > 0.05 || Math.abs(this.vy) > 120) && (s.air ?? true) && !s.climb && !s.ride;   // ignore 1-frame bumps
    if (this.wasAir && !air) this.land = Math.min(1, Math.abs(this.vy) / 500 + 0.5);
    this.wasAir = air;
    this.land = Math.max(0, this.land - dt * 5);
    // Tips trail opposite to the motion (and lift a little when falling); eased like a spring.
    const trailTarget = Phaser.Math.Clamp(-this.vx * 0.03, -9, 9);
    this.trail += (trailTarget - this.trail) * Math.min(1, dt * 8);

    const k = SHAPES[s.role] ?? SHAPES.scout, keys = KEYS[s.role];
    // 0 jog → 1 sprint: follows the sprint key (smoothly), not the measured speed, which the
    // game-speed setting scales.
    this.runT = (this.runT ?? 0) + ((s.sprint && speed > 5 ? 1 : 0) - (this.runT ?? 0)) * Math.min(1, dt * 6);
    const run = this.runT;
    // Advance the walk cycle by distance travelled, so feet don't slide at any fps.
    if (s.climb) this.phase += (climbed + moved * 0.5) * (Math.PI * 2 / 40) * ANIM_RATE;
    else if (!air && moved < 60) {
      const cyc = !keys ? 0 : s.crouch ? keys.crouchWalk.cycle : keys.walk.cycle + (keys.run.cycle - keys.walk.cycle) * run;
      const cycleLen = keys ? k.leg * 1.06 * cyc : 55;
      this.phase += moved * (Math.PI * 2 / cycleLen) * ANIM_RATE;
    }

    const pose = {
      k, f: s.wall ? s.wall : s.kick && s.kick < 0.2 && keys ? -(s.facing === -1 ? -1 : 1) : s.facing === -1 ? -1 : 1, speed, air,   // face the wall while clinging
      crouch: !!s.crouch, swing: Math.min(1, speed / r.speed) * (s.sprint ? 0.95 : 0.7), maxSpeed: r.speed,
      rising: air && this.vy < -60, time: now / 1000 * ANIM_RATE,   // breathing, hair, cloak ripple
      key: keys && (!s.climb || keys.climb) && !s.planted && (!s.carry || keys.carryArms) && (!s.brace || keys.brace) && !s.ride ? this.#keyPose(keys, s, speed / r.speed, run, air) : null,
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
    // Cut-out roles: the painted part images replace the drawn shapes, on the same skeleton.
    const cut = hasCutout(this.scene, s.role);
    if (cut && this.rig?.role !== s.role) { this.rig?.destroy(); this.rig = new CutoutRig(this.scene, s.role, 3); this.rig.role = s.role; }
    if (cut) { this.soft.clear(); this.gfx.clear(); this.rig.update(this.joints); }
    this.rig?.setVisible(cut);
  }

  /** Blend the role's key poses for the current state (movement, air, landing, crouch). */
  #keyPose(keys, s, speedFrac, run, air) {
    let p;
    // dash recover: after a dash ends, the recover pose fades out over ~0.3 s (real time)
    const dt = this.dashDt ?? 1 / 60;
    if (s.dash) this.dashRec = 1; else this.dashRec = Math.max(0, (this.dashRec ?? 0) - dt / 0.3);
    const w = this.#wardenPose(keys, s, air);
    if (w) return w;
    if (s.climb && keys.climb) {
      const move = Phaser.Math.Clamp(Math.hypot(this.vx, this.vy) / 40, 0, 1);
      return mix(resolve(keys.hang), cyclePose(keys.climb, this.phase / (Math.PI * 2), true), move);
    }
    if (s.dash && keys.dashLaunch) {
      const u = s.dash, W = resolve(keys.dashWind), La = resolve(keys.dashLaunch), G = resolve(keys.dashGlide);
      return u < 0.2 ? mix(W, La, u / 0.2) : u < 0.55 ? La : mix(La, G, (u - 0.55) / 0.45);
    }
    // time on the wall (real seconds): grab first, then ease into the slide
    this.wallTime = s.wall ? (this.wallTime ?? 0) + dt : 0;
    if (s.wall && keys.wallGrab) p = mix(resolve(keys.wallGrab), resolve(keys.wallSlide), Phaser.Math.Clamp((this.wallTime - 0.15) / 0.25, 0, 1));
    else if (s.kick && keys.kick) p = s.kick < 0.2 ? resolve(keys.wallCoil) : mix(resolve(keys.wallCoil), resolve(keys.kick), Math.min(1, (s.kick - 0.2) / 0.15));
    else if (s.pull && !air && keys.pullStart) {
      const u = Math.min(1, s.pull * 1.6), e = u * u * (3 - 2 * u);    // reach & grab, then pull back
      p = mix(resolve(keys.pullStart), resolve(keys.pullEnd), e);
    } else if (air) p = mix(resolve(keys.rise), resolve(keys.fall), Phaser.Math.Clamp((this.vy + 150) / 400, 0, 1));
    else {
      const t = this.phase / (Math.PI * 2);
      const move = Phaser.Math.Clamp(speedFrac * 6, 0, 1);            // any real movement → full cycle
      if (s.crouch) p = mix(resolve(keys.crouch), cyclePose(keys.crouchWalk, t), move);
      else p = mix(resolve(keys.idle), mix(cyclePose(keys.walk, t), cyclePose(keys.run, t), run), move);
      p = mix(p, resolve(keys.land), this.land * 0.6);                // absorb the landing (softly)
    }
    if (this.dashRec > 0 && keys.dashRecover) {                       // glide → recover → normal pose
      const r = this.dashRec;
      p = mix(p, air ? resolve(keys.dashGlide) : r > 0.5 ? mix(resolve(keys.dashRecover), resolve(keys.dashGlide), (r - 0.5) * 2) : resolve(keys.dashRecover), Math.min(1, r * 1.6));
    } else if (s.dash) p = { ...p, lean: p.lean + 0.4 };
    return p;
  }

  /** Warden ability poses (null when none applies). Each plays from its snapshot progress 0..1. */
  #wardenPose(keys, s, air) {
    if (!keys.brace) return null;
    const R = (k) => resolve(keys[k]);
    const ease = (u) => u * u * (3 - 2 * u);
    if (s.brace) return R('brace');
    if (s.smash) {                                               // wind-up → impact → recover
      const u = s.smash;
      return u < 0.25 ? mix(R('smashRec'), R('smashUp'), ease(u / 0.25))
        : u < 0.45 ? mix(R('smashUp'), R('smashDown'), ease((u - 0.25) / 0.2))
        : u < 0.7 ? R('smashDown') : mix(R('smashDown'), R('smashRec'), ease((u - 0.7) / 0.3));
    }
    if (s.toss) {                                                // wind back → release → settle
      const u = s.toss;
      return u < 0.3 ? mix(R('smashRec'), R('tossBack'), ease(u / 0.3))
        : u < 0.55 ? mix(R('tossBack'), R('tossOut'), ease((u - 0.3) / 0.25)) : mix(R('tossOut'), R('smashRec'), ease((u - 0.55) / 0.45));
    }
    if (s.lift) {                                                // squat & grab, then rise with the crate overhead
      const up = { ...R('idle'), arms: keys.carryArms.map((a) => [...a]) };
      return s.lift < 0.5 ? R('liftGrab') : mix(R('liftGrab'), up, ease((s.lift - 0.5) / 0.5));
    }
    if (s.carry && air) return { ...R('fall'), arms: keys.carryArms.map((a) => [...a]) };
    if (s.carry && !air) {                                       // walking legs, arms straight up under the crate
      const t = this.phase / (Math.PI * 2), move = Phaser.Math.Clamp(Math.abs(this.vx) / 30, 0, 1);
      const p = mix(R('idle'), cyclePose(keys.walk, t), move);
      return { ...p, lean: 0.02, arms: keys.carryArms.map((a) => [...a]) };
    }
    if (s.push && !air) return mix(R('pushA'), R('pushB'), (1 - Math.cos(this.phase)) / 2);
    return null;
  }

  /** Draws one full figure; returns the y of the top of the head (for the name label). */
  #drawFigure(g, s, p) {
    const { k, f, air, crouch, swing } = p;
    g.fillStyle(INK, 1);

    // --- skeleton (squash on landing, stretch while rising, breathing when idle) ---
    const squash = 1 - 0.2 * this.land, stretch = p.rising ? 1.03 : 1;
    const breath = !air && p.speed < 10 ? Math.sin(p.time * 2.2) * 0.5 : 0;
    // Legs are two fixed-length bones; the hip height sets how much the knees bend (IK below).
    const thigh = k.leg * 0.53, shin = k.leg * 0.53;
    const bob = !air && !s.climb && !s.planted ? -Math.abs(Math.sin(this.phase)) * 1.2 * swing : 0;   // rise at passing
    const hipH = k.leg * (crouch ? 0.6 : s.planted ? 0.84 : (k.stand ?? 0.95)) * (1 - 0.14 * this.land);
    const legLen = hipH;
    const K = p.key, L = thigh + shin;
    const hipX = s.x, hipY = K ? s.y - K.hip * L : s.y - hipH - (air ? 2 : 0) + bob;
    const lean = crouch ? 0.9 : Math.min(0.35, p.speed / p.maxSpeed * 0.25) + (s.dash ? 0.5 : 0);
    const torsoH = k.torso * (crouch && !K ? 0.6 : 1) * (K ? 1 : squash) * stretch;
    const neckX = K ? hipX + f * Math.sin(K.lean) * torsoH : hipX + f * lean * torsoH * 0.7;
    const neckY = K ? hipY - Math.cos(K.lean) * torsoH + breath : hipY - torsoH + breath;
    const R = k.headR;
    const headX = neckX + f * (k.headFwd ?? (crouch ? 3 : 1)), headY = neckY - R * 0.85 + (k.headDrop ?? 0);
    const widen = 1 + 0.12 * this.land;
    const J = g === this.gfx ? (this.joints = { f, lean: K ? K.lean : lean, hip: [hipX, hipY], neck: [neckX, neckY], head: [headX, headY], legs: [], arms: [] }) : null;

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
      if (K) { const [x, y, t] = K.legs[off ? 1 : 0]; ax = hx + f * x * L; ay = hipY + y * L; toe = t; }
      else if (s.planted) { ax = hx + (off ? -1 : 1) * f * legLen * 0.55; ay = s.y; toe = 0; }
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
      J?.legs.push([[hx, hipY], [kx, ky], [ex, ey], [tx, ty]]);
    }

    // --- body: a smooth bean from the hips to the neck ---
    this.#bean(g, hipX, hipY + 1, neckX, neckY, k.hipW * widen, k.chestW * widen, k.neckW);
    if (k.chestBulge) {                                          // barrel chest pushing out in front
      const cx = hipX + (neckX - hipX) * 0.68 + f * k.chestBulge, cy = hipY + (neckY - hipY) * 0.68;
      g.fillEllipse(cx, cy, k.chestW * 0.8, k.chestW * 0.75);
    }

    // --- arms: pick where the hand is, IK finds the elbow (the far arm first, a touch thinner) ---
    const shY = neckY + torsoH * (k.shoulderY ?? 0.12);
    const upper = k.arm * 0.52, fore = k.arm * 0.52;
    for (const side of [-f, f]) {
      const shX = neckX + side * k.chestW * (k.shoulderX ?? 0.3);   // side view: heavy roles' arms hang alongside the body
      let hx, hy, elbow = -f;                                 // elbows point backwards by default
      const beamArm = Array.isArray(s.beam) && side === f;
      if (K && !beamArm) {
        const [x, y, e] = K.arms[side === f ? 1 : 0];
        hx = shX + f * x * (upper + fore); hy = shY + y * (upper + fore); elbow = (e < 0 ? -1 : 1) * f;
      } else if (s.brace || s.carry) { hx = shX + side * 3; hy = shY - k.arm * 0.9; elbow = side; }            // arms up, elbows out
      else if (s.climb) { const up = Math.sin(this.phase + (side > 0 ? 0 : Math.PI)); hx = shX + f * 2; hy = shY - k.arm * (0.45 + 0.4 * up); elbow = side; }
      else if (Array.isArray(s.beam) && side === f) {                                                   // reach along the beam
        const [, , bx, by] = s.beam; const a = Math.atan2(by - shY, bx - shX);
        hx = shX + Math.cos(a) * k.arm * 0.97; hy = shY + Math.sin(a) * k.arm * 0.97;
      } else if (air) { hx = shX + side * k.arm * 0.4; hy = shY - k.arm * (p.rising ? 0.55 : 0.1); elbow = side; }
      else {
        // swing opposite to the legs; the forward arm bends more (a sprint pumps hard at the elbow)
        const a = Math.sin(this.phase + (side === f ? Math.PI : 0)) * swing * 0.9 + (k.armFwd ?? 0) * f;
        const reach = k.arm * ((k.armHang ?? 0.9) - (a * f > 0 ? a * f * (s.sprint ? 0.5 : 0.3) : 0)) * (crouch ? 0.8 : 1);
        hx = shX + Math.sin(a) * reach * f; hy = shY + Math.cos(a) * reach;
      }
      const [ex, ey, wx, wy] = ik(shX, shY, hx, hy, upper, fore, elbow);
      const far = side !== f ? 0.85 : 1;
      const pts = [[shX, shY], [ex, ey], [wx, wy]];
      J?.arms.push(pts);
      // Near arm over a wide body: a thin light rim (like the design sheet) keeps it readable.
      if (k.armRim && side === f && g === this.gfx) {
        g.fillStyle(RIM, 1);
        this.#limb(g, pts, [k.armLimb[0] + k.armRim * 2, k.armLimb[1] + k.armRim * 2]);
        g.fillStyle(INK, 1);
      }
      this.#limb(g, pts, [k.armLimb[0] * far, k.armLimb[1] * far]);
      // hand: a small shape continuing past the wrist
      const hl = Math.hypot(wx - ex, wy - ey) || 1, dxh = (wx - ex) / hl, dyh = (wy - ey) / hl;
      const handR = k.armLimb[1] * (k.handScale ?? 0.62);
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
    if (s.role === 'weaver') {
      // Rounded hood, a little bigger than the head; its soft tip droops down the back and trails.
      const hr = R * 1.15;
      g.fillCircle(x - f * 0.8, y - 0.3, hr);
      const bx = x - f * hr * 0.7, by = y - hr * 0.55;
      const tipX = x - f * hr * 1.15 + trail * 0.5, tipY = y + hr * 1.35 - Math.abs(trail) * 0.2;   // droops down the back
      g.fillTriangle(bx, by, x - f * hr * 0.2, y + hr * 0.6, tipX, tipY);
      g.fillCircle(tipX, tipY, 1.2);
    } else {
      g.fillEllipse(x, y, R * 2, R * 2.05);
    }
    if (s.role === 'scout') this.#hair(g, x, y, R, f, p);
    if (s.role === 'warden') {                                   // small tuft of hair on top
      const sway = trail * 0.15;
      for (const [a, l] of [[-0.5, 3.2], [-0.05, 3.8], [0.4, 2.8]]) {
        const bx = x + f * Math.sin(a) * R * 0.7, by = y - Math.cos(a) * R * 0.75;
        g.fillTriangle(bx - 1.1, by + 0.5, bx + 1.1, by + 0.5, bx + f * (a * 2) - 0.6 + sway, by - l);
      }
    }
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
      pts.push([sx - f * u * 4 + trail * u * 0.45, sy + u * 6 + Math.sin(t * 9 - u * 4) * u * 0.9]);   // short, droops down the back
    }
    this.#limb(g, pts, [2.6, 1.2]);
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

  destroy() { this.soft.destroy(); this.gfx.destroy(); this.label.destroy(); this.rig?.destroy(); }
}
