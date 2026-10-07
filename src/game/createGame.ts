import Phaser from 'phaser';
import type { GameStore } from '@/core/store';
import { installDirector } from './director';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { ZoneScene } from './scenes/ZoneScene';

export const VIEW_W = 1280;
export const VIEW_H = 720;

/** Creates the Phaser game. Scenes reach the store through `game.registry.get('store')`. */
export function createGame(store: GameStore, parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#050506',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    disableContextMenu: true,
    audio: { noAudio: true },
    input: { mouse: { preventDefaultWheel: true } },
    render: { antialias: true, roundPixels: false },
    scene: [BootScene, TitleScene, ZoneScene],
    callbacks: {
      preBoot: (g) => {
        g.registry.set('store', store);
      },
    },
  });
  installDirector(game, store);
  return game;
}

export function storeOf(scene: Phaser.Scene): GameStore {
  return scene.registry.get('store') as GameStore;
}
