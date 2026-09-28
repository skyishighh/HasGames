// Physics substepping for Arcade Physics in variable-step mode (fixedStep: false).
//
// Phaser normally takes ONE physics step per rendered frame. On a slow frame (e.g. 100 ms) that single
// step is large enough for a falling body to pass straight through a thin floor ("tunneling").
// This splits each frame into steps of at most MAX_STEP_MS, exactly like Phaser's own fixed-step loop
// does (preUpdate + colliders for the first step, then World.step() for the rest). At 60 fps it is
// still one step per frame, so smooth movement is unchanged.
//
// Written against Phaser 4.2.1's Arcade World.update(); re-check if Phaser is upgraded.
const MAX_STEP_MS = 1000 / 60;
const MAX_SUBSTEPS = 8;

/**
 * @param world        the scene's Arcade World
 * @param sceneEvents  the scene's system events (scene.sys.events)
 */
export function enableSubstepping(world, sceneEvents) {
  // The Arcade plugin subscribed the ORIGINAL world.update to the scene's update event at boot, so
  // replacing the method alone does nothing: swap the subscription too. (The plugin's own pause/resume
  // look up world.update at call time, so they keep working with the replacement.)
  sceneEvents.off(Phaser.Scenes.Events.UPDATE, world.update, world);
  world.update = function update(time, delta) {
    if (this.isPaused || this.bodies.size === 0) return;
    delta *= this.slowMo ?? 1;                          // dev inspect mode: slow motion

    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(delta / MAX_STEP_MS)));
    const dt = (delta / steps) * 0.001;

    // First substep: sync bodies from their game objects and move them (as Phaser does).
    this.bodies.forEach((body) => { if (body.enable) body.preUpdate(true, dt); });
    if (this.useTree) {
      this.tree.clear();
      this.tree.load(Array.from(this.bodies));
    }
    for (const collider of this.colliders.update()) if (collider.active) collider.update();
    this.emit(Phaser.Physics.Arcade.Events.WORLD_STEP, dt);
    this.stepsLastFrame = 1;

    // Remaining substeps: move + collide again with the same small dt.
    for (let i = 1; i < steps; i++) this.step(dt);
  };
  sceneEvents.on(Phaser.Scenes.Events.UPDATE, world.update, world);
}
