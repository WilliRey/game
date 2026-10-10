# Credits

HOLDOUT is an original game. Its story, characters, place names, dialogue and notes were written for this
project and don't come from The Last Stand or any other game.

## Art and audio

- **Art:** every model and texture is generated procedurally at runtime. Characters (Sam, every zombie
  type, the NPCs), weapons, props, vehicles and trees are low-poly vertex-coloured three.js geometry built in
  code (`src/game/art/models.ts`); floor tiles, walls, decals and sprites are painted with Canvas2D
  (`src/game/art/textures.ts`). All of it is placeholder art, requested through the asset-key manifest in
  `src/game/art/manifest.ts`, so real models and textures can replace it (`src/game/art/assets.ts`,
  `MODEL_OVERRIDES` / `TEXTURE_OVERRIDES`).
- **Sound:** every sound effect is synthesized at runtime with the WebAudio API
  (`src/game/audio/AudioManager.ts`). No audio files ship with the game.
- **Fonts:** the UI uses the system font stack (Segoe UI / system-ui / Roboto / Helvetica / Arial); no
  font files are bundled.
- No third-party art or audio packs are used. If CC0 packs (for example Kenney's or Quaternius') are added
  through the overrides, list them here with their licenses.

## Libraries

| Library | License | Use |
|---|---|---|
| [three.js](https://threejs.org) 0.186.1 | MIT | 3D rendering (WebGL), lights and shadows, the glTF loader for model overrides |
| [Preact](https://preactjs.com) | MIT | the HTML/CSS overlay UI |
| [zod](https://zod.dev) | MIT | content schemas and validation |
| [Vite](https://vite.dev) | MIT | dev server and bundling |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 | language |
| [Vitest](https://vitest.dev) | MIT | unit tests |
| [Playwright](https://playwright.dev) | Apache-2.0 | browser smoke tests |
| [ESLint](https://eslint.org), [typescript-eslint](https://typescript-eslint.io) | MIT | linting |
| [Prettier](https://prettier.io) | MIT | formatting |
| [tsx](https://tsx.is) | MIT | running the content validator in Node |

## Inspiration

The feel (not the IP) of *The Last Stand: Aftermath* and *The Last Stand: Union City* by Con Artist Games:
top-down line-of-sight scavenging, crafting from scrap, fuel-limited travel between locations, and a fixed
protagonist with a personal story.
