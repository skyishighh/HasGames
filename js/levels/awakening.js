// Act II — "The Solo Awakening". Four separated zones, one per role, each ending on a
// viewing platform at the rim of a central chasm (x 2500–3500) where the players
// first see each other. Rectangles: { x, y, w, h }, (x, y) = top-left. y grows downward.
//
//   top-left    : Scout  — "The Pit"          (wakes bottom-left, climbs up and right)
//   bottom-left : Warden — "The Collapse"     (wakes left, pushes right)
//   top-right   : Anchor — "The Cliff"        (wakes right, walks left against the wind)
//   bottom-right: Weaver — "The Dark Tunnel"  (wakes right, walks left in darkness)
export default {
  name: 'The Awakening',
  width: 6000,
  height: 1600,
  parallax: false,

  // Blurred near-black trunks in front of the play area (js/art/Foreground.js).
  foreground: { factor: 1.4, spacing: [1100, 1800] },

  // Painted backgrounds in assets/bg/ (see docs/ART_PROMPTS.md). Each zone has its own set and they
  // cross-fade at the borders; a missing zone image falls back to the default one.
  backdrops: {
    default: { sky: 'awakening_sky.png', far: 'awakening_far.png', mid: 'awakening_mid.png' },
    zones: {
      pit:      { rect: { x: 0, y: 0, w: 2500, h: 1000 },    sky: 'pit_sky.png',      far: 'pit_far.png',      mid: 'pit_mid.png' },
      collapse: { rect: { x: 0, y: 1000, w: 2500, h: 600 },  sky: 'collapse_sky.png', far: 'collapse_far.png', mid: 'collapse_mid.png' },
      cliff:    { rect: { x: 3500, y: 0, w: 2500, h: 1000 }, sky: 'cliff_sky.png',    far: 'cliff_far.png',    mid: 'cliff_mid.png' },
      tunnel:   { rect: { x: 3500, y: 1000, w: 2500, h: 600 }, sky: 'tunnel_sky.png', far: 'tunnel_far.png',   mid: 'tunnel_mid.png' },
      chasm:    { rect: { x: 2500, y: 0, w: 1000, h: 1600 } },   // uses the default forest set
    },
  },

  spawns: {
    scout: { x: 150, y: 900 },
    warden: { x: 150, y: 1540 },
    anchor: { x: 5760, y: 700 },
    weaver: { x: 5850, y: 1540 },
  },

  // Respawn points (feet position). Touching one makes it your checkpoint.
  checkpoints: [
    { x: 150, y: 900 }, { x: 745, y: 900 }, { x: 950, y: 740 }, { x: 1320, y: 380 }, { x: 1700, y: 120 }, { x: 2150, y: 120 },
    { x: 150, y: 1540 }, { x: 760, y: 1440 }, { x: 1330, y: 1440 }, { x: 1550, y: 1440 }, { x: 1850, y: 1540 },
    { x: 5760, y: 700 }, { x: 5250, y: 700 }, { x: 4500, y: 700 }, { x: 4050, y: 700 },
    { x: 5850, y: 1540 }, { x: 5150, y: 1540 }, { x: 4670, y: 1540 }, { x: 4325, y: 1540 }, { x: 3970, y: 1540 },
  ],

  solids: [
    // --- rock layers separating the zones
    { x: 0, y: 940, w: 2500, h: 120 },
    { x: 3500, y: 940, w: 2500, h: 120 },

    // ================= SCOUT — The Pit =================
    { x: 0, y: 900, w: 880, h: 40 },            // pit floor
    { x: 300, y: 872, w: 30, h: 28 },           // rocks to hop over
    { x: 450, y: 880, w: 40, h: 20 },
    { x: 560, y: 300, w: 140, h: 600, vent: true }, // fallen pipe: a crawling Scout passes under it
    { x: 790, y: 740, w: 510, h: 200 },         // shaft 1 right wall / ledge (160 high, 90 wide: needs a wall-jump)
    { x: 1260, y: 380, w: 240, h: 360 },        // mesh wall face and top ledge
    { x: 1500, y: 380, w: 120, h: 40 },
    { x: 1520, y: 120, w: 20, h: 260, vent: true }, // shaft 2 (narrow, tall): left wall; crawl through its base
    { x: 1600, y: 120, w: 20, h: 260 },         // shaft 2 right wall
    { x: 1620, y: 120, w: 280, h: 40 },         // top shelf
    { x: 1900, y: 200, w: 200, h: 40 },         // practice gap: shallow trench floor (harmless)
    { x: 2100, y: 120, w: 100, h: 40 },
    { x: 2480, y: 120, w: 160, h: 40 },         // VIEWING PLATFORM (Scout)
    { x: 2634, y: 86, w: 6, h: 34 },            // railing post at the chasm edge

    // ================= WARDEN — The Collapse =================
    { x: 0, y: 1060, w: 400, h: 380 },          // collapsed iron: low ceiling over the start
    { x: 400, y: 1060, w: 1740, h: 180 },       // ceiling
    { x: 0, y: 1540, w: 700, h: 60 },           // start floor
    { x: 700, y: 1440, w: 1060, h: 160 },       // raised floor (reach it by pushing the block)
    { x: 1760, y: 1440, w: 40, h: 40 },
    { x: 1920, y: 1440, w: 180, h: 40 },
    { x: 2100, y: 1240, w: 40, h: 240 },        // wall: the only way on is down through the cracked floor
    { x: 1760, y: 1540, w: 880, h: 60 },        // lower room floor → VIEWING PLATFORM (Warden) at the end
    { x: 2634, y: 1506, w: 6, h: 34 },          // railing post

    // ================= ANCHOR — The Cliff =================
    { x: 3950, y: 700, w: 150, h: 240 },
    { x: 4350, y: 700, w: 1570, h: 240 },       // cliff top (pit at the far right edge)
    { x: 3500, y: 700, w: 350, h: 20 },         // tunnel ceiling
    { x: 3380, y: 880, w: 570, h: 60 },         // tunnel floor → VIEWING PLATFORM (Anchor)
    { x: 3380, y: 846, w: 6, h: 34 },           // railing post
    { x: 3700, y: 400, w: 40, h: 300 },         // wall: the top path is closed, go down through the debris

    // ================= WEAVER — The Dark Tunnel =================
    { x: 3500, y: 1060, w: 2500, h: 240 },      // tunnel ceiling
    { x: 5660, y: 1540, w: 340, h: 60 },        // start floor
    { x: 5600, y: 1590, w: 60, h: 10 },         // small dark dip (harmless)
    { x: 4950, y: 1540, w: 650, h: 60 },
    { x: 4700, y: 1560, w: 250, h: 40 },        // shallow trench under the first phantom bridge (harmless)
    { x: 4640, y: 1540, w: 60, h: 60 },         // safe pad: recharge before the long bridges
    { x: 4300, y: 1540, w: 50, h: 60 },         // island to recharge light between two long bridges
    { x: 3380, y: 1540, w: 620, h: 60 },        // → VIEWING PLATFORM (Weaver)
    { x: 3380, y: 1506, w: 6, h: 34 },          // railing post
  ],

  // Falling into these respawns you at your checkpoint.
  hazards: [
    { x: 1500, y: 880, w: 1000, h: 60 },        // void under the Scout's upper route
    { x: 4100, y: 880, w: 250, h: 60 },         // gap under the Anchor's bridge
    { x: 5920, y: 660, w: 80, h: 280 },         // cliff edge behind the Anchor
    { x: 4000, y: 1580, w: 300, h: 20 },        // Weaver: pits under the long bridges
    { x: 4350, y: 1580, w: 290, h: 20 },
  ],

  mesh: [{ x: 1200, y: 380, w: 60, h: 360 }],

  // Warden
  blocks: [{ id: 'b1', x: 480, y: 1480, w: 60, h: 60 }],
  crates: [{ id: 'c1', x: 820, y: 1440 }],
  buttons: [{ id: 's1', x: 1060, y: 1290, w: 40, h: 90, opens: 'g1' }], // switch panel beside the door: hit it with a thrown crate (stays pressed)
  cracked: [{ id: 'w1', x: 1250, y: 1240, w: 30, h: 200 }],
  crushers: [
    { id: 'k1', x: 1400, w: 80, h: 60, top: 1240, floor: 1440, period: 6, safe: true }, // slow & harmless: shoves you back
    { id: 'k2', x: 1620, w: 80, h: 60, top: 1240, floor: 1440, period: 3 },
  ],
  fragile: [{ id: 'f1', x: 1800, y: 1440, w: 120, h: 16 }],

  // Anchor
  wind: [
    { x: 5300, y: 400, w: 620, h: 300, push: 300, on: 1.4, off: 1.8, startCalm: true },
    { x: 4600, y: 400, w: 700, h: 300, push: 360, on: 1.3, off: 1.3 },
  ],
  plates: [{ id: 'p1', x: 4400, y: 692, w: 90, opens: 'br1', latch: true }], // stays down: the Anchor crosses alone
  debris: [{ id: 'd1', x: 3850, y: 700, w: 100, h: 40 }],   // Anchor slam breaks it

  // Weaver
  nodes: [{ id: 'n1', x: 5300, y: 1360, opens: 'g2', latch: true }],
  phantom: [
    // first bridge (short, over a harmless trench)
    { id: 'ph1', x: 4700, y: 1540, w: 84, h: 16 }, { id: 'ph2', x: 4784, y: 1540, w: 84, h: 16 }, { id: 'ph3', x: 4868, y: 1540, w: 82, h: 16 },
    // long bridges: light drains — recharge on the island in between
    { id: 'ph4', x: 4350, y: 1540, w: 97, h: 16 }, { id: 'ph5', x: 4447, y: 1540, w: 97, h: 16 }, { id: 'ph6', x: 4544, y: 1540, w: 96, h: 16 },
    { id: 'ph7', x: 4000, y: 1540, w: 100, h: 16 }, { id: 'ph8', x: 4100, y: 1540, w: 100, h: 16 }, { id: 'ph9', x: 4200, y: 1540, w: 100, h: 16 },
  ],

  gates: [
    { id: 'g1', x: 1100, y: 1240, w: 24, h: 200 },                 // Warden door (crate on the switch)
    { id: 'g2', x: 5200, y: 1300, w: 24, h: 240 },                 // Weaver door (light the node)
    { id: 'br1', x: 4100, y: 700, w: 250, h: 14, bridge: true },   // Anchor drawbridge (heavy plate)
  ],

  // Darkness (alpha = how dark). The Weaver's light cuts through.
  dark: [
    { x: 3500, y: 1060, w: 2500, h: 540, alpha: 0.97 },
    { x: 0, y: 500, w: 900, h: 440, alpha: 0.55 },
    { x: 0, y: 1060, w: 700, h: 540, alpha: 0.5 },
  ],

  // Wordless atmosphere: a Hollow watching (vanishes when you get close).
  hollows: [
    { x: 1400, y: 380, type: 'watch', radius: 260 },                // Scout: on the rim above
    { x: 2260, y: 1540, type: 'watch', radius: 180, grate: true },  // Warden: behind a grate
    { x: 4720, y: 700, type: 'watch', radius: 200 },                // Anchor: standing in the storm
    { x: 3790, y: 1540, type: 'dark', radius: 60 },                 // Weaver: revealed by the flare
  ],

  // Code Fragments: each unlocks one ability, placed right before its first use.
  fragments: [
    { role: 'scout', ability: 'crawl', x: 528, y: 900 },
    { role: 'scout', ability: 'walljump', x: 745, y: 900 },
    { role: 'scout', ability: 'climb', x: 1170, y: 740 },
    { role: 'scout', ability: 'dash', x: 1850, y: 120 },
    { role: 'warden', ability: 'push', x: 420, y: 1540 },
    { role: 'warden', ability: 'lift', x: 760, y: 1440 },
    { role: 'warden', ability: 'smash', x: 1190, y: 1440 },
    { role: 'warden', ability: 'brace', x: 1360, y: 1440 },
    { role: 'anchor', ability: 'plant', x: 5715, y: 700 },
    { role: 'anchor', ability: 'slam', x: 4020, y: 700 },
    { role: 'weaver', ability: 'beam', x: 5790, y: 1540 },
    { role: 'weaver', ability: 'flare', x: 3975, y: 1540 },
  ],

  // Client-side scripted moments.
  triggers: [
    { x: 2480, y: 0, w: 160, h: 120, action: 'reveal' },
    { x: 2400, y: 1300, w: 240, h: 240, action: 'reveal' },
    { x: 3380, y: 720, w: 120, h: 160, action: 'reveal' },
    { x: 3380, y: 1300, w: 120, h: 240, action: 'reveal' },
    { x: 3880, y: 1300, w: 60, h: 240, action: 'shake' },           // Weaver: "a sound in the dark"
  ],
  reveal: { x: 3000, y: 830, zoom: 0.38 },

  // The central vault the players will open together in Act III (background only for now).
  vault: { x: 2780, y: 520, w: 440, h: 620 },
};
