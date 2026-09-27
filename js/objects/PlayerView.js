// Visual representation of a player: a role-specific placeholder silhouette.
// Purely cosmetic — collisions use the host's invisible hitbox — so this can later
// be swapped for real (AI-generated, cut-out animated) art without touching physics.
import { ROLES } from '../roles.js';

const INK = 0x050505;

export class PlayerView {
  constructor(scene, name, isLocal) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(3);
    this.label = scene.add.text(0, 0, name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: isLocal ? '#eeeeee' : '#bbbbbb',
    }).setOrigin(0.5, 1).setDepth(3);
    this.x = 0;
    this.y = 0;
  }

  /** s: player snapshot — x = center, y = feet. */
  applyState(s) {
    this.x = s.x;
    this.y = s.y;
    const r = ROLES[s.role] ?? ROLES.scout;
    const h = s.crouch ? r.crouchH : r.h;
    const w = r.w;
    const f = s.facing === -1 ? -1 : 1;
    const g = this.gfx.clear();
    const top = s.y - h;
    const headR = Math.max(6, w * 0.38);

    g.fillStyle(INK, 1);
    if (s.role === 'warden') {
      g.fillRect(s.x - w / 2, top + headR, w, h - headR);                 // broad torso
      g.fillCircle(s.x, top + headR * 0.9, headR);
      g.fillRect(s.x - w / 2 - 4, top + headR + 4, 5, h * 0.45);          // heavy arms
      g.fillRect(s.x + w / 2 - 1, top + headR + 4, 5, h * 0.45);
    } else if (s.role === 'anchor') {
      g.fillRect(s.x - w / 2, top + headR, w, h - headR);
      g.fillCircle(s.x, top + headR * 0.9, headR * 0.9);
      // the anchor carried on the back (or driven into the ground when planted)
      const ax = s.x - f * (w / 2 + 3);
      if (s.planted) {
        g.fillRect(s.x + f * (w / 2 + 2) - 2, top + 6, 4, h + 8);
        g.fillTriangle(s.x + f * (w / 2 + 2) - 7, s.y + 8, s.x + f * (w / 2 + 2) + 7, s.y + 8, s.x + f * (w / 2 + 2), s.y + 16);
      } else {
        g.fillRect(ax - 2, top + 4, 4, h * 0.7);
        g.fillTriangle(ax - 7, top + h * 0.7, ax + 7, top + h * 0.7, ax, top + h * 0.7 + 8);
      }
    } else {
      g.fillRect(s.x - w / 2, top + headR, w, h - headR);
      g.fillCircle(s.x, top + headR * 0.9, headR);
    }

    // eye
    g.fillStyle(0xffffff, 1).fillRect(s.x + f * headR * 0.4 - 1.5, top + headR * 0.7, 3, 3);

    // Weaver: glowing hands show light energy (no HUD text).
    if (s.role === 'weaver' && (!s.ab || s.ab.includes('beam'))) {
      const a = 0.15 + 0.85 * ((s.energy ?? 100) / 100);
      g.fillStyle(0xffffff, a).fillCircle(s.x + f * (w / 2 + 2), top + h * 0.55, 3.5);
    }
    // Warden bracing: arms raised.
    if (s.brace) g.fillStyle(INK, 1).fillRect(s.x - w / 2, top - 14, w, 6);

    this.label.setPosition(s.x, top - 6);
  }

  destroy() { this.gfx.destroy(); this.label.destroy(); }
}
