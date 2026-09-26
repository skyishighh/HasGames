// Reads the local keyboard into the shared input shape (see roles.js EMPTY_INPUT).
export class LocalInput {
  constructor(scene) {
    this.keys = scene.input.keyboard.addKeys(
      'A,D,W,S,E,J,K,SPACE,SHIFT,UP,DOWN,LEFT,RIGHT,ONE,TWO,THREE,FOUR,ZERO,TAB');
  }

  read() {
    const k = this.keys;
    return {
      left: k.A.isDown || k.LEFT.isDown,
      right: k.D.isDown || k.RIGHT.isDown,
      up: k.W.isDown || k.UP.isDown,
      down: k.S.isDown || k.DOWN.isDown,
      jump: k.W.isDown || k.UP.isDown || k.SPACE.isDown,
      interact: k.E.isDown,
      a1: k.J.isDown,
      a2: k.K.isDown,
      sprint: k.SHIFT.isDown,
    };
  }

  /**
   * Developer actions (test build only):
   *  1–4 → { role: index }   switch the controlled character's role
   *  0   → { spawn: true }   spawn a dummy teammate
   *  Tab → { cycle: true }   switch control between your character and your dummies
   */
  devAction() {
    const k = this.keys;
    const J = Phaser.Input.Keyboard.JustDown;
    const roleKeys = [k.ONE, k.TWO, k.THREE, k.FOUR];
    for (let i = 0; i < roleKeys.length; i++) if (J(roleKeys[i])) return { role: i };
    if (J(k.ZERO)) return { spawn: true };
    if (J(k.TAB)) return { cycle: true };
    return null;
  }
}
