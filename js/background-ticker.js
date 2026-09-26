// Keeps a Phaser game running while its tab is hidden.
// Used by the host only: the host runs the simulation for every player,
// so a paused host tab would freeze the game for everyone.
export function keepRunningWhenHidden(game) {
  const worker = new Worker(new URL('./tick-worker.js', import.meta.url));
  worker.onmessage = () => game.loop.tick();

  game.events.on(Phaser.Core.Events.HIDDEN, () => {
    game.loop.sleep();          // stop requestAnimationFrame
    worker.postMessage('start');
  });
  game.events.on(Phaser.Core.Events.VISIBLE, () => {
    worker.postMessage('stop');
    game.loop.wake();           // back to requestAnimationFrame
  });
}
