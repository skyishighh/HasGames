// Level 1 — "The Gate". Pure data: loaded identically by host and guests.
// All rectangles are { x, y, w, h } with (x, y) = top-left, in world pixels.
//
// Puzzle: the gate is too tall to jump. Pressing EITHER plate opens it, so one
// player holds the near plate while the others pass, then someone on the far
// side holds the far plate so the first player can follow. Needs 2+ players.
export default {
  name: 'The Gate',
  width: 2400,
  height: 540,
  spawn: { x: 120, y: 460, spacing: 50 },   // feet position of the first player; others line up to the right

  solids: [
    { x: 0, y: 460, w: 2400, h: 80 },        // ground
    { x: 480, y: 390, w: 120, h: 16 },       // warm-up steps
    { x: 660, y: 330, w: 120, h: 16 },
    { x: 1700, y: 390, w: 140, h: 16 },
    { x: 1900, y: 330, w: 140, h: 16 },
  ],

  // Plates sit on the ground; any one pressed opens every gate in the level.
  plates: [
    { x: 1040, y: 452, w: 60, h: 8 },        // near side
    { x: 1460, y: 452, w: 60, h: 8 },        // far side
  ],

  gates: [
    { x: 1250, y: 290, w: 24, h: 170 },      // 170 px > max jump height (~107 px)
  ],

  finish: { x: 2220, y: 300, w: 180, h: 160 },
};
