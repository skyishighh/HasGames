// Draws the Limbo-style scene: grey fog backdrop, black silhouettes.
import { WIDTH, HEIGHT, GROUND_Y, PLAYER_W, PLAYER_H } from './world.js';

export function render(ctx, players, myId) {
  const bg = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 50, WIDTH / 2, HEIGHT / 2, WIDTH * 0.7);
  bg.addColorStop(0, '#9a9a94');
  bg.addColorStop(1, '#1c1c1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#050505';
  ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  for (const p of players) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(p.x, p.y + 12, PLAYER_W, PLAYER_H - 12);               // body
    ctx.beginPath();
    ctx.arc(p.x + PLAYER_W / 2, p.y + 8, 9, 0, Math.PI * 2);           // head
    ctx.fill();
    ctx.fillStyle = '#fff';                                            // glowing eye
    ctx.fillRect(p.x + PLAYER_W / 2 + p.facing * 3 - 1.5, p.y + 6, 3, 3);

    ctx.fillStyle = p.id === myId ? '#eee' : '#bbb';
    ctx.fillText(p.name, p.x + PLAYER_W / 2, p.y - 8);
  }
}
