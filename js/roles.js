// Role definitions: movement stats and hitbox size per role.
// All numbers are starting values to tune in playtesting (see docs/GAME_DESIGN.md §2).
export const ROLES = {
  scout:  { speed: 250, jump: 620, w: 14, h: 32, crouchH: 16, color: 0x050505 },
  warden: { speed: 180, jump: 520, w: 26, h: 46, crouchH: 46, color: 0x050505 },
  weaver: { speed: 210, jump: 600, w: 16, h: 40, crouchH: 40, color: 0x050505 },
  anchor: { speed: 190, jump: 540, w: 22, h: 42, crouchH: 42, color: 0x050505 },
};
export const ROLE_ORDER = ['scout', 'warden', 'weaver', 'anchor'];

/** Keyboard state sent from each client to the host. */
export const EMPTY_INPUT = {
  left: false, right: false, up: false, down: false,
  jump: false, interact: false, a1: false, a2: false,
};
/** Buttons whose *press* (not hold) matters; host detects presses per player. */
export const EDGE_KEYS = ['jump', 'interact', 'a1', 'a2'];
