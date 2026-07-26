/**
 * Light2D vertex shader（Phase 2 VS4 Spec §HD-2D 光照）。
 *
 * 输入：
 *  - `a_position`: quad 在 NDC（[-1, 1]）下的位置
 *  - `a_uv`:       对应纹理坐标（[0, 1]）
 *
 * 输出：
 *  - `v_uv`:       传给 fragment 用于采样 normalMap / lightMap
 *
 * 设计：
 *  - 不写 MVP 矩阵（光源层全屏 quad，避免光照视差）
 *  - 单精度浮点已足够（同福客栈设计分辨率 640×480）
 *  - 不引入 phong / normalMap transform 矩阵：normalMap 已是面向相机的"屏幕空间"
 *
 * 测试友好：
 *  - 用 `export const LIGHT2D_VERTEX_SOURCE` 暴露原文，可被 pipeline 解析成 token
 *  - 解析失败时 pipeline 走 fallback（无光照路径）
 */
export const LIGHT2D_VERTEX_SOURCE = /* glsl */ `
attribute vec2 a_position;
attribute vec2 a_uv;

varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * 解析 vertex shader：剥离注释 + 关键字校验，确保 WebGL 编译失败时能
 * 上溯到本文件（pipeline 不会盲目 throw）。
 */
export function assertLight2DVertexShape(source: string): void {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('[lighting] vertex shader source is empty');
  }
  if (!/attribute\s+vec2\s+a_position\b/.test(source)) {
    throw new Error('[lighting] vertex shader missing attribute vec2 a_position');
  }
  if (!/varying\s+vec2\s+v_uv\b/.test(source)) {
    throw new Error('[lighting] vertex shader missing varying vec2 v_uv');
  }
  if (!/void\s+main\s*\(/.test(source)) {
    throw new Error('[lighting] vertex shader missing main()');
  }
}
