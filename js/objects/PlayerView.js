// Visual representation of a player (placeholder Limbo silhouette).
// Purely cosmetic: collisions use a separate invisible hitbox on the host,
// so this can later be swapped for sprite-sheet animation without touching physics.
import { PLAYER_H } from '../config.js';

const SILHOUETTE = 0x050505;

export class PlayerView extends Phaser.GameObjects.Container {
  constructor(scene, name, isLocal) {
    super(scene, 0, 0);
    const top = -PLAYER_H / 2;
    this.body_ = scene.add.rectangle(0, top + 12 + (PLAYER_H - 12) / 2, 18, PLAYER_H - 12, SILHOUETTE);
    this.head = scene.add.circle(0, top + 8, 9, SILHOUETTE);
    this.eye = scene.add.rectangle(3, top + 7.5, 3, 3, 0xffffff);
    this.label = scene.add.text(0, top - 8, name, {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: isLocal ? '#eeeeee' : '#bbbbbb',
    }).setOrigin(0.5, 1);
    this.add([this.body_, this.head, this.eye, this.label]);
    scene.add.existing(this);
  }

  /** Apply a network/simulation state: center position + facing direction. */
  applyState(x, y, facing) {
    this.setPosition(x, y);
    this.eye.x = facing * 3;
  }
}
