// Act II — "The Solo Awakening". Four separated zones, one per role, each ending on a
// viewing platform at the rim of a central chasm (x 9500–10500) where the players
// first see each other. Rectangles: { x, y, w, h }, (x, y) = top-left. y grows downward.
//
//   top-left    : Scout  — "The Pit"          (wakes far left, ~2 min journey right and up)
//   bottom-left : Warden — "The Collapse"     (wakes left, pushes right)
//   top-right   : Anchor — "The Cliff"        (wakes right, walks left against the wind)
//   bottom-right: Weaver — "The Dark Tunnel"  (wakes right, walks left in darkness)
//
// Every zone follows the same rhythm (see docs/GAME_DESIGN.md → "Zone pacing"):
// explore → learn 1st ability → explore → learn 2nd → movement → interaction → learn 3rd →
// interaction → movement → learn 4th → mix of all → viewing platform.
// The Scout zone is built to this rhythm; the other three zones are the original short versions,
// moved right by DX so they still meet at the chasm. They get the same treatment next.

const DX = 7000;                                              // how far the old zones moved right
const shift = (list) => list.map((o) => ({ ...o, x: o.x + DX }));

// ======================================================================= SCOUT — The Pit
// Beats (x ranges): 1 explore 0–1500 · 2 crawl 1500–2100 · 3 explore 2100–3500 ·
// 4 wall-jump 3500–3830 · 5 movement 3830–5200 · 6 lever 5200–5900 · 7 climb 5900–6400 ·
// 8 lever + climb 6400–7000 · 9 drop / crawl-under / wall-jump 7000–7700 · 10 dash 7700–8200 ·
// 11 mix (crawl, drop, climb, dash) 8200–9480 · 12 viewing platform 9480.
const SCOUT = {
  solids: [
    { x: 0, y: 940, w: 9500, h: 120 },          // bedrock under the whole Scout zone

    // 1 · Explore: wake in the dark, uneven ground, a figure on a far ledge.
    { x: 0, y: 900, w: 3740, h: 40 },           // cave floor (beats 1–4, runs under the shaft wall)
    { x: 300, y: 872, w: 30, h: 28 },           // rocks to hop over
    { x: 450, y: 880, w: 40, h: 20 },
    { x: 700, y: 860, w: 300, h: 40 },          // low mound
    { x: 1100, y: 820, w: 120, h: 80 },         // boulder
    { x: 1250, y: 640, w: 250, h: 20 },         // unreachable ledge (something stands there)

    // 2 · Learn crawl: a fallen pipe blocks the way; only crawling gets under it.
    { x: 1700, y: 300, w: 140, h: 600, vent: true },

    // 3 · Explore: rising steps to a lookout, then back down. Room to look around.
    { x: 2300, y: 860, w: 200, h: 40 },
    { x: 2500, y: 820, w: 250, h: 80 },
    { x: 2750, y: 780, w: 300, h: 120 },        // lookout
    { x: 3050, y: 820, w: 150, h: 80 },
    { x: 3200, y: 860, w: 150, h: 40 },
    { x: 3150, y: 500, w: 200, h: 20 },         // far ledge above (another watcher)

    // 4 · Learn wall-jump: crawl through the pipe wall into a narrow shaft, wall-jump out.
    { x: 3700, y: 500, w: 40, h: 400, vent: true }, // left wall of the shaft (crawl through its base)
    { x: 3740, y: 900, w: 90, h: 40 },          // shaft floor
    { x: 3830, y: 740, w: 570, h: 200 },        // ledge on top (160 up: too high to jump)

    // 5 · Movement: gaps, a crawl-only slot under a rock, more gaps.
    { x: 4540, y: 740, w: 220, h: 200 },
    { x: 4760, y: 740, w: 300, h: 200 },
    { x: 4860, y: 380, w: 100, h: 280 },        // overhanging rock…
    { x: 4860, y: 660, w: 100, h: 80, vent: true }, // …with a slot under it: crawl through

    // 6 · Interaction: a gate blocks the path; the lever beside it opens it.
    { x: 5200, y: 740, w: 860, h: 200 },        // long platform (beats 6–7)

    // 7 · Learn climb: a wall with a climbable mesh.
    { x: 6060, y: 380, w: 340, h: 560 },        // cliff block, top at 380

    // 8 · Interaction + climb: climb to an alcove, pull the lever, a bridge lowers over the gap.
    { x: 6180, y: 200, w: 140, h: 16 },         // alcove shelf with the lever
    { x: 6700, y: 380, w: 300, h: 560 },        // far side of the gap

    // 9 · Movement: drop down, crawl-walk under a hanging wall, wall-jump up the shaft.
    { x: 7000, y: 560, w: 400, h: 380 },        // lower floor (also the shaft floor)
    { x: 7270, y: 160, w: 40, h: 340 },         // hanging wall (gap of 60 under it)
    { x: 7400, y: 120, w: 300, h: 820 },        // tall block, top at 120

    // 10 · Learn dash: a gap too wide to jump.
    { x: 7980, y: 120, w: 220, h: 820 },        // landing after the dash gap

    // 11 · Mix: crawl slot, drop, climb, final dash.
    { x: 8200, y: 0, w: 200, h: 80 },           // low rock ceiling (above the Scout's head)…
    { x: 8200, y: 80, w: 200, h: 40, vent: true }, // …crawl-only slot under it
    { x: 8200, y: 120, w: 200, h: 820 },
    { x: 8400, y: 400, w: 260, h: 540 },        // drop down
    { x: 8700, y: 120, w: 300, h: 820 },        // climb back up (mesh on its left face)
    { x: 9280, y: 120, w: 200, h: 820 },        // landing after the final dash
    { x: 9480, y: 120, w: 160, h: 40 },         // 12 · VIEWING PLATFORM (Scout)
    { x: 9634, y: 86, w: 6, h: 34 },            // railing post at the chasm edge
  ],
  hazards: [
    { x: 4400, y: 880, w: 140, h: 60 },         // pits in the movement run
    { x: 5060, y: 880, w: 140, h: 60 },
    { x: 6400, y: 880, w: 300, h: 60 },         // under the lowered bridge
    { x: 7700, y: 880, w: 280, h: 60 },         // dash gap
    { x: 8660, y: 880, w: 40, h: 60 },
    { x: 9000, y: 880, w: 280, h: 60 },         // final dash gap
  ],
  mesh: [
    { x: 6000, y: 380, w: 60, h: 360 },         // 7 · first climb
    { x: 6320, y: 200, w: 40, h: 180 },         // 8 · up to the lever alcove
    { x: 8660, y: 120, w: 40, h: 280 },         // 11 · climb back up
  ],
  levers: [
    { id: 'l1', x: 5450, y: 740, opens: 'gs1' },
    { id: 'l2', x: 6230, y: 200, opens: 'brs1' },
  ],
  gates: [
    { id: 'gs1', x: 5600, y: 540, w: 24, h: 200 },                 // 6 · lever gate
    { id: 'brs1', x: 6400, y: 380, w: 300, h: 14, bridge: true },  // 8 · lever bridge
  ],
  fragments: [
    { role: 'scout', ability: 'crawl', x: 1580, y: 900 },
    { role: 'scout', ability: 'walljump', x: 3620, y: 900 },
    { role: 'scout', ability: 'climb', x: 5900, y: 740 },
    { role: 'scout', ability: 'dash', x: 7620, y: 120 },
  ],
  checkpoints: [
    { x: 150, y: 900 }, { x: 1000, y: 860 }, { x: 1620, y: 900 }, { x: 2900, y: 780 }, { x: 3620, y: 900 },
    { x: 3900, y: 740 }, { x: 5300, y: 740 }, { x: 5950, y: 740 }, { x: 6150, y: 380 }, { x: 6780, y: 380 },
    { x: 7100, y: 560 }, { x: 7450, y: 120 }, { x: 8050, y: 120 }, { x: 8480, y: 400 }, { x: 8780, y: 120 },
  ],
  dark: [{ x: 0, y: 500, w: 900, h: 440, alpha: 0.55 }],
  hollows: [
    { x: 1375, y: 640, type: 'watch', radius: 260 },               // 1 · on the far ledge
    { x: 3250, y: 500, type: 'watch', radius: 300 },               // 3 · watching from above the lookout
  ],
  triggers: [
    { x: 2800, y: 600, w: 100, h: 180, action: 'shake' },          // 3 · a rumble at the lookout
    { x: 9480, y: 0, w: 160, h: 120, action: 'reveal' },
  ],
};

// ================================================================== WARDEN — The Collapse
// Underground, below the Scout (y 1060–1600). Beats (x ranges): 1 explore 0–1400 · 2 push 1400–2200 ·
// 3 explore 2200–3400 · 4 lift & throw 3400–4200 · 5 movement 4200–5200 · 6 lever 5200–5700 ·
// 7 smash 5700–6300 · 8 smash + lever 6300–7000 · 9 movement + harmless crusher 7000–7800 ·
// 10 brace 7800–8400 · 11 mix (smash, brace, push) 8400–9400 · 12 viewing platform 9400–9640.
const WARDEN = {
  solids: [
    { x: 0, y: 1060, w: 400, h: 380 },          // 1 · collapsed iron: low ceiling over the start
    { x: 0, y: 1540, w: 1800, h: 60 },          // start hall floor
    { x: 500, y: 1500, w: 80, h: 40 },          // rubble
    { x: 850, y: 1490, w: 120, h: 50 },
    { x: 1800, y: 1440, w: 2400, h: 160 },      // 2 · raised floor (100 up: push the block to reach it)
    { x: 2600, y: 1400, w: 100, h: 40 },        // 3 · rubble on the long walk
    { x: 3000, y: 1390, w: 80, h: 50 },
    { x: 3400, y: 1060, w: 900, h: 180 },       // 4 · low ceiling over the switch room
    { x: 4290, y: 1440, w: 250, h: 160 },       // 5 · movement: gap, step up, wider gap
    { x: 4540, y: 1380, w: 200, h: 220 },
    { x: 4850, y: 1440, w: 1150, h: 160 },      // 5–7 · long floor
    { x: 6000, y: 1440, w: 1000, h: 160 },      // 8
    { x: 7000, y: 1540, w: 2640, h: 60 },       // 9–12 · lower hall floor (drop down)
    { x: 7150, y: 1500, w: 80, h: 40 },         // rubble
    { x: 7300, y: 1060, w: 1350, h: 180 },      // ceiling over the crusher hall
    { x: 8900, y: 1440, w: 400, h: 100 },       // 11 · step (100 up: push the block)
    { x: 9634, y: 1506, w: 6, h: 34 },          // railing post at the chasm edge
  ],
  hazards: [
    { x: 4200, y: 1560, w: 90, h: 40 },
    { x: 4740, y: 1560, w: 110, h: 40 },
  ],
  blocks: [
    { id: 'b1', x: 1600, y: 1480, w: 60, h: 60 },   // 2 · push to the raised floor
    { id: 'b2', x: 8700, y: 1480, w: 60, h: 60 },   // 11 · push to the step
  ],
  crates: [{ id: 'c1', x: 3560, y: 1440 }],
  buttons: [{ id: 's1', x: 3800, y: 1290, w: 40, h: 90, opens: 'g1' }],  // 4 · hit it with a thrown crate
  cracked: [
    { id: 'w1', x: 5950, y: 1240, w: 30, h: 200 },  // 7
    { id: 'w2', x: 6400, y: 1240, w: 30, h: 200 },  // 8 · hides the lever
    { id: 'w3', x: 8300, y: 1340, w: 30, h: 200 },  // 11
  ],
  crushers: [
    { id: 'k1', x: 7400, w: 80, h: 60, top: 1240, floor: 1540, period: 6, safe: true }, // 9 · harmless: shoves you back
    { id: 'k2', x: 8050, w: 80, h: 60, top: 1240, floor: 1540, period: 3 },             // 10 · brace to pass
    { id: 'k3', x: 8500, w: 80, h: 60, top: 1240, floor: 1540, period: 2.5 },           // 11
  ],
  levers: [
    { id: 'lw1', x: 5350, y: 1440, opens: 'gw1' },
    { id: 'lw2', x: 6550, y: 1440, opens: 'gw2' },
  ],
  gates: [
    { id: 'g1', x: 3840, y: 1240, w: 24, h: 200 },  // 4 · switch door
    { id: 'gw1', x: 5600, y: 1240, w: 24, h: 200 }, // 6
    { id: 'gw2', x: 6800, y: 1240, w: 24, h: 200 }, // 8
  ],
  fragments: [
    { role: 'warden', ability: 'push', x: 1450, y: 1540 },
    { role: 'warden', ability: 'lift', x: 3460, y: 1440 },
    { role: 'warden', ability: 'smash', x: 5760, y: 1440 },
    { role: 'warden', ability: 'brace', x: 7860, y: 1540 },
  ],
  checkpoints: [
    { x: 150, y: 1540 }, { x: 1450, y: 1540 }, { x: 1850, y: 1440 }, { x: 3000, y: 1440 }, { x: 3450, y: 1440 },
    { x: 3950, y: 1440 }, { x: 4900, y: 1440 }, { x: 5300, y: 1440 }, { x: 6100, y: 1440 }, { x: 6900, y: 1440 },
    { x: 7100, y: 1540 }, { x: 7800, y: 1540 }, { x: 8200, y: 1540 }, { x: 9350, y: 1540 },
  ],
  dark: [{ x: 0, y: 1060, w: 700, h: 540, alpha: 0.5 }],
  hollows: [
    { x: 3200, y: 1440, type: 'watch', radius: 200, grate: true },  // 3 · behind a grate
    { x: 7700, y: 1540, type: 'watch', radius: 220 },               // 9 · beyond the first crusher
  ],
  triggers: [
    { x: 2700, y: 1300, w: 100, h: 140, action: 'shake' },          // 3 · a rumble in the collapse
    { x: 9400, y: 1300, w: 240, h: 240, action: 'reveal' },
  ],
};

// ================================================== ANCHOR, WEAVER (original layout, moved by DX)
const REST = {
  solids: [
    // --- rock layer separating the right-hand zones
    { x: 3500, y: 940, w: 2500, h: 120 },

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
    { x: 4100, y: 880, w: 250, h: 60 },         // gap under the Anchor's bridge
    { x: 5920, y: 660, w: 80, h: 280 },         // cliff edge behind the Anchor
    { x: 4000, y: 1580, w: 300, h: 20 },        // Weaver: pits under the long bridges
    { x: 4350, y: 1580, w: 290, h: 20 },
  ],

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
    { id: 'g2', x: 5200, y: 1300, w: 24, h: 240 },                 // Weaver door (light the node)
    { id: 'br1', x: 4100, y: 700, w: 250, h: 14, bridge: true },   // Anchor drawbridge (heavy plate)
  ],

  fragments: [
    { role: 'anchor', ability: 'plant', x: 5715, y: 700 },
    { role: 'anchor', ability: 'slam', x: 4020, y: 700 },
    { role: 'weaver', ability: 'beam', x: 5790, y: 1540 },
    { role: 'weaver', ability: 'flare', x: 3975, y: 1540 },
  ],

  // Respawn points (feet position). Touching one makes it your checkpoint.
  checkpoints: [
    { x: 5760, y: 700 }, { x: 5250, y: 700 }, { x: 4500, y: 700 }, { x: 4050, y: 700 },
    { x: 5850, y: 1540 }, { x: 5150, y: 1540 }, { x: 4670, y: 1540 }, { x: 4325, y: 1540 }, { x: 3970, y: 1540 },
  ],

  // Darkness (alpha = how dark). The Weaver's light cuts through.
  dark: [
    { x: 3500, y: 1060, w: 2500, h: 540, alpha: 0.97 },
  ],

  // Wordless atmosphere: a Hollow watching (vanishes when you get close).
  hollows: [
    { x: 4720, y: 700, type: 'watch', radius: 200 },                // Anchor: standing in the storm
    { x: 3790, y: 1540, type: 'dark', radius: 60 },                 // Weaver: revealed by the flare
  ],

  // Client-side scripted moments.
  triggers: [
    { x: 3380, y: 720, w: 120, h: 160, action: 'reveal' },
    { x: 3380, y: 1300, w: 120, h: 240, action: 'reveal' },
    { x: 3880, y: 1300, w: 60, h: 240, action: 'shake' },           // Weaver: "a sound in the dark"
  ],
};

const merged = (key) => [...(SCOUT[key] ?? []), ...(WARDEN[key] ?? []), ...shift(REST[key] ?? [])];

export default {
  name: 'The Awakening',
  width: 6000 + DX,
  height: 1600,
  parallax: false,

  // Painted backgrounds in assets/bg/ (see docs/ART_PROMPTS.md). Each zone has its own set and they
  // cross-fade at the borders; a missing zone image falls back to the default one.
  backdrops: {
    enabled: false,     // OFF for now: art direction to be re-discussed (images kept in assets/bg/)
    foreground: true,   // blurred black silhouettes made from each zone's mid image, in front of play
    default: { sky: 'awakening_sky.png', far: 'awakening_far.png', mid: 'awakening_mid.png' },
    zones: {
      pit:      { rect: { x: 0, y: 0, w: 2500 + DX, h: 1000 },  sky: 'pit_sky.png',      far: 'pit_far.png',      mid: 'pit_mid.png' },
      collapse: { rect: { x: 0, y: 1000, w: 2500 + DX, h: 600 },    sky: 'collapse_sky.png', far: 'collapse_far.png', mid: 'collapse_mid.png' },
      cliff:    { rect: { x: 3500 + DX, y: 0, w: 2500, h: 1000 }, sky: 'cliff_sky.png',  far: 'cliff_far.png',    mid: 'cliff_mid.png' },
      tunnel:   { rect: { x: 3500 + DX, y: 1000, w: 2500, h: 600 }, sky: 'tunnel_sky.png', far: 'tunnel_far.png', mid: 'tunnel_mid.png' },
      chasm:    { rect: { x: 2500 + DX, y: 0, w: 1000, h: 1600 } },   // uses the default forest set
    },
  },

  spawns: {
    scout: { x: 150, y: 900 },
    warden: { x: 150, y: 1540 },
    anchor: { x: 5760 + DX, y: 700 },
    weaver: { x: 5850 + DX, y: 1540 },
  },

  checkpoints: merged('checkpoints'),
  solids: merged('solids'),
  hazards: merged('hazards'),
  mesh: merged('mesh'),
  levers: merged('levers'),
  blocks: merged('blocks'),
  crates: merged('crates'),
  buttons: merged('buttons'),
  cracked: merged('cracked'),
  crushers: merged('crushers'),
  fragile: merged('fragile'),
  wind: merged('wind'),
  plates: merged('plates'),
  debris: merged('debris'),
  nodes: merged('nodes'),
  phantom: merged('phantom'),
  gates: merged('gates'),
  dark: merged('dark'),
  hollows: merged('hollows'),
  // Code Fragments: each unlocks one ability, placed right before its first use.
  fragments: merged('fragments'),
  triggers: merged('triggers'),
  reveal: { x: 3000 + DX, y: 830, zoom: 0.38 },

  // The central vault the players will open together in Act III (background only for now).
  vault: { x: 2780 + DX, y: 520, w: 440, h: 620 },
};
