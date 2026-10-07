/** Dev tools are only available in dev builds or with ?debug=1 (brief §5). */
export const devTools = {
  enabled:
    import.meta.env.DEV ||
    (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')),
  /** F3 debug overlay. */
  overlay: false,
  /** Draw everything, ignoring fog of war. */
  fovOff: false,
};

/** Numbers the zone scene publishes for the debug overlay panel. */
export const debugInfo = {
  fps: 0,
  zombies: 0,
  awake: 0,
  chasing: 0,
  entities: 0,
  playerTile: '',
  noise: 0,
  frameMs: 0,
  simMs: 0,
};
