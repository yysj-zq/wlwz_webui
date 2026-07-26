/**
 * Lighting §shaders barrel（Phase 2 VS4）。
 *
 * 提供：
 *  - vertex / fragment shader 源（字符串）
 *  - 最小化 shape 校验（用于 WebGL 不可用时仍可解析）
 *
 * 注意：shader 源是静态字符串，不应在运行时拼接；如需变体，请复制一份新源。
 */
export { LIGHT2D_VERTEX_SOURCE, assertLight2DVertexShape } from './light2d.vert.glsl';

export { LIGHT2D_FRAGMENT_SOURCE, assertLight2DFragmentShape } from './light2d.frag.glsl';
