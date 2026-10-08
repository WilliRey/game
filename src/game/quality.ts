/**
 * Render quality tiers. Real GPUs get shadows, more lights and full resolution; software renderers (the
 * SwiftShader/llvmpipe WebGL used by CI and headless browsers) get a cheap tier so the game stays playable
 * and the tests stay fast. Browsers without WebGL at all fall back to the 2D renderer (`fallback2d.ts`).
 * Override with `?quality=high|low` or `?renderer=2d`.
 */
export interface QualityTier {
  name: 'high' | 'low';
  /** Multiplier on devicePixelRatio (capped). */
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMap: number;
  /** Size of the shared point-light pool. */
  pointLights: number;
}

export const HIGH: QualityTier = {
  name: 'high',
  pixelRatio: 1.75,
  antialias: true,
  shadows: true,
  shadowMap: 1024,
  pointLights: 6,
};

export const LOW: QualityTier = {
  name: 'low',
  pixelRatio: 0.7,
  antialias: false,
  shadows: false,
  shadowMap: 512,
  pointLights: 2,
};

function param(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

/** Which renderer to use: 'webgl' unless WebGL is missing or `?renderer=2d` asks for the fallback. */
export function chooseRenderer(): 'webgl' | '2d' {
  if (param('renderer') === '2d') return '2d';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return '2d';
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return 'webgl';
  } catch {
    return '2d';
  }
}

/** Decide the tier from the renderer string (software GL → low) or the URL. */
export function detectQuality(gl: WebGLRenderingContext | WebGL2RenderingContext): QualityTier {
  const forced = param('quality');
  if (forced === 'low') return LOW;
  if (forced === 'high') return HIGH;
  let renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    /* unknown */
  }
  if (/swiftshader|llvmpipe|software|softpipe|microsoft basic render/i.test(renderer)) return LOW;
  return HIGH;
}
