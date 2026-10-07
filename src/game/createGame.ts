import Phaser from 'phaser';
import type { GameStore } from '@/core/store';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';

export const VIEW_W = 1280;
export const VIEW_H = 720;

/** Creates the Phaser game. Scenes reach the store through `game.registry.get('store')`. */
export function createGame(
  store: GameStore,
  parent: HTMLElement,
  extraScenes: Phaser.Types.Scenes.SceneType[] = [],
): Phaser.Game {
  return new Phaser.Game({
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
    scene: [BootScene, TitleScene, ...extraScenes],
    callbacks: {
      preBoot: (game) => {
        game.registry.set('store', store);
      },
    },
  });
}

export function storeOf(scene: Phaser.Scene): GameStore {
  return scene.registry.get('store') as GameStore;
}
