// "Ability Gym" — a developer test room with one station per ability.
// Stations run left→right: Scout, Warden, Anchor, Weaver. Checkpoints sit
// between stations; falling into a pit respawns you at your last checkpoint.
// Rectangles are { x, y, w, h } with (x, y) = top-left. Ground top is y = 460.
const G = 460;

export default {
  name: 'Ability Gym',
  width: 4800,
  height: 540,
  spawn: { x: 100, spacing: 40 },
  checkpoints: [100, 1420, 1790, 2680, 2900, 3560, 3990],

  // Ground is split around pits.
  solids: [
    { x: 0, y: G, w: 1500, h: 80 },
    { x: 1720, y: G, w: 780, h: 80 },
    { x: 2620, y: G, w: 1030, h: 80 },
    { x: 3900, y: G, w: 400, h: 80 },
    { x: 4560, y: G, w: 240, h: 80 },

    // Scout — wall-jump shaft: two hanging walls (walk under them), ledge on top.
    { x: 560, y: 100, w: 20, h: 280 },
    { x: 640, y: 100, w: 20, h: 280 },
    { x: 660, y: 100, w: 140, h: 14 },
    // Scout — mesh wall leads to this ledge.
    { x: 960, y: 160, w: 120, h: 14 },
    // Scout — vent: a low block; only a crawling Scout fits underneath.
    { x: 1150, y: 390, w: 200, h: 46 },

    // Warden — high ledge reachable only by standing on the pushed block.
    { x: 2050, y: 350, w: 150, h: 110 },

    // Anchor — post holding the chain hook on the far side of the gap.
    { x: 3910, y: 340, w: 16, h: 120 },
  ],

  oneWay: [{ x: 1180, y: 330, w: 140 }],                  // thin: stand on it, S to drop through
  mesh: [{ x: 900, y: 160, w: 60, h: 300 }],

  blocks: [{ id: 'b1', x: 1880, y: G - 60, w: 60, h: 60 }], // heavy: Warden only
  crates: [{ id: 'c1', x: 2280, y: G - 20 }],              // light: Warden lifts/throws
  cracked: [{ id: 'w1', x: 2420, y: G - 130, w: 24, h: 130 }],
  fragile: [{ id: 'f1', x: 2500, y: G, w: 120, h: 12 }],   // bridge that breaks under the Warden
  crushers: [{ id: 'k1', x: 2760, w: 80, h: 60, top: 250, period: 3 }],

  wind: [{ x: 3000, y: 200, w: 260, h: 260, push: -320, on: 1.6, off: 1.1 }],
  plates: [{ id: 'p1', x: 3330, y: G - 8, w: 90, opens: 'g1' }], // heavy plate: Anchor only
  gates: [
    { id: 'g1', x: 3480, y: G - 170, w: 24, h: 170 },
    { id: 'g2', x: 4200, y: G - 170, w: 24, h: 170 },
  ],
  hooks: [{ id: 'h1', x: 3918, y: 344 }],

  nodes: [{ id: 'n1', x: 4110, y: 280, opens: 'g2' }],     // Weaver powers while lit
  phantom: [
    { id: 'ph1', x: 4330, y: 430, w: 60, h: 12 },
    { id: 'ph2', x: 4410, y: 410, w: 60, h: 12 },
    { id: 'ph3', x: 4490, y: 430, w: 60, h: 12 },
  ],
};
