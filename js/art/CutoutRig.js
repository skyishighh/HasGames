// Cut-out ("puppet") characters: painted body-part images placed on the procedural skeleton that
// PlayerView already computes (hips, knees, ankles, shoulders, elbows, wrists, neck, head).
// The parts come from a parts sheet (docs/reference/poses/<role>_parts.png) cut into
// assets/characters/<role>/*.png. Each part is drawn pointing straight down (limbs) or upright
// (torso, head); `a` is the joint it hangs from and `b` the joint it points to, in sheet pixels.
// Purely cosmetic, like the rest of PlayerView: physics never sees these images.

const DIR = 'assets/characters/';
const K = 0.4;   // the part images were saved at 0.4 x the sheet's resolution

// Per role: game px per sheet px, and each part's pivots in sheet pixels (origin = the part's
// top-left corner on the sheet). Joint positions were measured from warden_parts.png.
const RIGS = {
  warden: {
    scale: 0.052,
    rimmed: ['upperarm', 'forearm'],
    parts: {
      thigh:    { origin: [363, 599],  a: [425, 645],  b: [430, 830] },
      shin:     { origin: [711, 633],  a: [766, 672],  b: [760, 845] },
      foot:     { origin: [1023, 787], a: [1075, 872], b: [1190, 872] },   // a: under the ankle, on the sole
      torso:    { origin: [512, 174],  a: [603, 525],  b: [610, 192] },    // hip → neck
      head:     { origin: [234, 269],  a: [322, 365],  b: [322, 265] },    // centre → up
      upperarm: { origin: [875, 238],  a: [930, 292],  b: [945, 470] },
      forearm:  { origin: [1164, 232], a: [1226, 275], b: [1228, 470] },   // elbow → wrist (hand below)
    },
  },
};


/** Queue the part images of every cut-out role. Call from the scene's preload(). */
export function preloadCutouts(scene) {
  for (const [role, rig] of Object.entries(RIGS)) {
    for (const name of Object.keys(rig.parts)) scene.load.image(`cut_${role}_${name}`, `${DIR}${role}/${name}.png`);
    // Light outlines for the near arm (the part grown by ~1 px, light gray), so it reads over the black body.
    for (const name of rig.rimmed ?? []) scene.load.image(`cut_${role}_${name}_rim`, `${DIR}${role}/${name}_rim.png`);
  }
}

/** True when a role has a rig and all of its part images loaded. */
export function hasCutout(scene, role) {
  const rig = RIGS[role];
  return !!rig && Object.keys(rig.parts).every((n) => scene.textures.exists(`cut_${role}_${n}`));
}

export class CutoutRig {
  constructor(scene, role, depth) {
    this.rig = RIGS[role];
    const img = (name, d, rim = false) => {
      const p = this.rig.parts[name];
      const o = scene.add.image(0, 0, `cut_${role}_${name}${rim ? '_rim' : ''}`).setDepth(d);
      o.setOrigin((p.a[0] - p.origin[0]) * K / o.width, (p.a[1] - p.origin[1]) * K / o.height);
      o.rest = Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);   // the part's own direction on the sheet
      return o;
    };
    // Back to front: far arm, far leg, torso, head, near leg, near-arm rim, near arm.
    this.far = { upper: img('upperarm', depth - 0.04), fore: img('forearm', depth - 0.04) };
    this.legs = [0, 1].map((i) => ({
      thigh: img('thigh', depth - 0.03 + i * 0.04), shin: img('shin', depth - 0.03 + i * 0.04), foot: img('foot', depth - 0.03 + i * 0.04),
    }));
    this.torso = img('torso', depth);
    this.head = img('head', depth + 0.005);
    this.rim = { upper: img('upperarm', depth + 0.02, true), fore: img('forearm', depth + 0.02, true) };
    this.near = { upper: img('upperarm', depth + 0.03), fore: img('forearm', depth + 0.03) };
    this.all = [this.far.upper, this.far.fore, ...this.legs.flatMap((l) => [l.thigh, l.shin, l.foot]),
      this.torso, this.head, this.rim.upper, this.rim.fore, this.near.upper, this.near.fore];
  }

  /**
   * Place every part from the skeleton's joints (world px).
   * j = { f, hip, neck, head, lean, legs: [[hip, knee, ankle, toe] x2], arms: [[shoulder, elbow, wrist] (far), (near)] }
   */
  update(j) {
    const s = this.rig.scale / K, f = j.f;
    // A part placed at joint A, turned so its own direction points at joint B; mirrored when facing left.
    const put = (o, A, B) => {
      const rest = f < 0 ? Math.PI - o.rest : o.rest;
      o.setPosition(A[0], A[1]).setScale(s * f, s)
        .setRotation(Math.atan2(B[1] - A[1], B[0] - A[0]) - rest);
    };
    j.legs.forEach(([hip, knee, ankle, toe], i) => {
      const l = this.legs[i];
      put(l.thigh, hip, knee); put(l.shin, knee, ankle); put(l.foot, ankle, toe);
    });
    put(this.torso, j.hip, j.neck);
    put(this.head, j.head, [j.head[0] + Math.sin(j.lean * 0.5) * f, j.head[1] - 1]);
    const [farArm, nearArm] = j.arms;
    put(this.far.upper, farArm[0], farArm[1]); put(this.far.fore, farArm[1], farArm[2]);
    put(this.near.upper, nearArm[0], nearArm[1]); put(this.near.fore, nearArm[1], nearArm[2]);
    put(this.rim.upper, nearArm[0], nearArm[1]); put(this.rim.fore, nearArm[1], nearArm[2]);
  }

  setVisible(v) { for (const o of this.all) o.setVisible(v); }
  setAlpha(a) { for (const o of this.all) o.setAlpha(a); }
  destroy() { for (const o of this.all) o.destroy(); }
}
