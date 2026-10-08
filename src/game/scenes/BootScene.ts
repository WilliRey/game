import Phaser from 'phaser';
import { generatePlaceholders } from '../art/placeholders';
import { storeOf } from '../createGame';

/**
 * Loads real art if any is listed (none in v1), then generates placeholder textures for every manifest
 * key that is still missing, and hands over to the title scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generatePlaceholders(this);
    const store = storeOf(this);
    this.scene.start('Title');
    store.setPhase('menu');
    store.open('mainMenu');
  }
}
