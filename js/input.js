// Keyboard input -> a small, serializable input state.
const pressed = new Set();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  pressed.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => pressed.delete(e.code));
addEventListener('blur', () => pressed.clear());

export function readInput() {
  return {
    left: pressed.has('KeyA') || pressed.has('ArrowLeft'),
    right: pressed.has('KeyD') || pressed.has('ArrowRight'),
    jump: pressed.has('KeyW') || pressed.has('ArrowUp') || pressed.has('Space'),
  };
}
