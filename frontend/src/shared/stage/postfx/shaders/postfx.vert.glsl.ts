/**
 * PostFX vertex shader（Phase 2 VS5 Spec §Bloom + Vignette + Color Grading）。
 *
 * 单一职责：把全屏 quad 的 (position, uv) 直接输出到 fragment。
 * 不做 transform：post-fx 永远在屏幕空间做合成。
 */
export const POSTFX_VERTEX_SOURCE = /* glsl */ `
attribute vec2 a_position;
attribute vec2 a_uv;

varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export function assertPostFXVertexShape(source: string): void {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('[postfx] vertex shader source is empty');
  }
  if (!/attribute\s+vec2\s+a_position\b/.test(source)) {
    throw new Error('[postfx] vertex shader missing attribute vec2 a_position');
  }
  if (!/varying\s+vec2\s+v_uv\b/.test(source)) {
    throw new Error('[postfx] vertex shader missing varying vec2 v_uv');
  }
  if (!/void\s+main\s*\(/.test(source)) {
    throw new Error('[postfx] vertex shader missing main()');
  }
}
