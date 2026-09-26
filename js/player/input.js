// Reads the local keyboard into the shared input shape (see roles.js EMPTY_INPUT).
export class LocalInput {
  constructor(scene) {
    this.keys = scene.input.keyboard.addKeys(
      'A,D,W,S,E,J,K,SPACE,UP,DOWN,LEFT,RIGHT,ONE,TWO,THREE,FOUR');
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
    };
  }

  /** Developer role switch (keys 1–4). Returns a role index or -1. */
  rolePressed() {
    const k = this.keys;
    const J = Phaser.Input.Keyboard.JustDown;
    if (J(k.ONE)) return 0;
    if (J(k.TWO)) return 1;
    if (J(k.THREE)) return 2;
    if (J(k.FOUR)) return 3;
    return -1;
  }
}
