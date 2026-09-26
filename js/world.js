// Game simulation. Runs ONLY on the host; guests just render the snapshots.
export const WIDTH = 960, HEIGHT = 540, GROUND_Y = 460;
const GRAVITY = 1800, MOVE_SPEED = 220, JUMP_SPEED = 620;
const PLAYER_W = 18, PLAYER_H = 40;

const EMPTY_INPUT = { left: false, right: false, jump: false };

export class World {
  constructor() {
    this.players = new Map(); // id -> player
  }

  addPlayer(id, name) {
    const slot = this.players.size;
    this.players.set(id, {
      id, name, x: 120 + slot * 50, y: GROUND_Y - PLAYER_H,
      vx: 0, vy: 0, onGround: true, facing: 1, input: { ...EMPTY_INPUT },
    });
  }

  removePlayer(id) { this.players.delete(id); }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || typeof input !== 'object') return;
    // Never trust network data: coerce to booleans.
    p.input = { left: !!input.left, right: !!input.right, jump: !!input.jump };
  }

  step(dt) {
    for (const p of this.players.values()) {
      const dir = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
      p.vx = dir * MOVE_SPEED;
      if (dir) p.facing = dir;
      if (p.input.jump && p.onGround) { p.vy = -JUMP_SPEED; p.onGround = false; }

      p.vy += GRAVITY * dt;
      p.x = Math.min(Math.max(p.x + p.vx * dt, 0), WIDTH - PLAYER_W);
      p.y += p.vy * dt;
      if (p.y >= GROUND_Y - PLAYER_H) { p.y = GROUND_Y - PLAYER_H; p.vy = 0; p.onGround = true; }
    }
  }

  /** Compact state sent to guests. */
  snapshot() {
    return [...this.players.values()].map(({ id, name, x, y, facing }) =>
      ({ id, name, x: Math.round(x), y: Math.round(y), facing }));
  }
}

export { PLAYER_W, PLAYER_H };
