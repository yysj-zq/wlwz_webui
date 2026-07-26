/**
 * PostFX fragment shader（Phase 2 VS5 Spec §Bloom + Vignette + Color Grading）。
 *
 * 流程：
 *   1) 取 scene 颜色（来自 stage 主帧缓冲）
 *   2) 多 tap 采样做近似 bloom（5x5 十字），按 threshold 过滤
 *   3) vignette（径向衰减）
 *   4) 色彩分级：warmth / saturation / contrast
 *   5) 输出
 *
 * 性能：
 *  - 5 tap 十字采样（前后 1 + 对角 4），平衡画质 / 性能
 *  - 不做 mipmap chain；Phaser 4 后续可换成 pipeline 自带的 mipmap
 *
 * 与 publicState 联动：
 *  - 全部参数通过 uniform 输入；pipeline 在 WebGL 不可用时只更新
 *    snapshot（让 HUD / DOM 层反映），不渲染。
 */
export const POSTFX_FRAGMENT_SOURCE = /* glsl */ `
precision mediump float;

varying vec2 v_uv;

uniform sampler2D u_scene;
uniform vec2 u_resolution;

uniform float u_bloomThreshold;
uniform float u_bloomIntensity;
uniform float u_bloomRadius;

uniform float u_vignetteStart;
uniform float u_vignetteEnd;
uniform float u_vignetteIntensity;

uniform float u_warmth;       // [-1, 1]
uniform float u_saturation;   // [-1, 1]
uniform float u_contrast;     // [-1, 1]

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 sampleBloom(vec2 uv, float radius) {
  vec2 px = radius / u_resolution;
  vec3 acc = vec3(0.0);
  // 5-tap 十字
  acc += max(texture2D(u_scene, uv + vec2( 0.0, -px.y)).rgb - u_bloomThreshold, 0.0);
  acc += max(texture2D(u_scene, uv + vec2( 0.0,  px.y)).rgb - u_bloomThreshold, 0.0);
  acc += max(texture2D(u_scene, uv + vec2(-px.x,  0.0)).rgb - u_bloomThreshold, 0.0);
  acc += max(texture2D(u_scene, uv + vec2( px.x,  0.0)).rgb - u_bloomThreshold, 0.0);
  acc += max(texture2D(u_scene, uv).rgb - u_bloomThreshold, 0.0);
  return acc / 5.0;
}

void main() {
  vec4 base = texture2D(u_scene, v_uv);
  vec3 color = base.rgb;

  // bloom
  vec3 bloom = sampleBloom(v_uv, u_bloomRadius) * u_bloomIntensity;

  // vignette
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(v_uv, center);
  float vignette = 1.0 - smoothstep(u_vignetteStart, u_vignetteEnd, dist) * u_vignetteIntensity;

  // color grading
  color += bloom;
  color *= vignette;

  // warmth: 暖色偏红/黄；冷色偏蓝
  vec3 warmShift = vec3(1.1, 1.0, 0.85);
  vec3 coolShift = vec3(0.9, 1.0, 1.1);
  vec3 shifted = mix(vec3(1.0), warmShift, max(u_warmth, 0.0));
  shifted = mix(shifted, coolShift, max(-u_warmth, 0.0));
  color *= shifted;

  // saturation
  float luma = dot(color, LUMA);
  color = mix(vec3(luma), color, 1.0 + u_saturation);

  // contrast around 0.5
  color = (color - 0.5) * (1.0 + u_contrast) + 0.5;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
}
`;

export function assertPostFXFragmentShape(source: string): void {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('[postfx] fragment shader source is empty');
  }
  const required = [
    /uniform\s+sampler2D\s+u_scene\b/,
    /uniform\s+float\s+u_bloomThreshold\b/,
    /uniform\s+float\s+u_bloomIntensity\b/,
    /uniform\s+float\s+u_vignetteStart\b/,
    /uniform\s+float\s+u_warmth\b/,
    /uniform\s+float\s+u_saturation\b/,
    /uniform\s+float\s+u_contrast\b/,
    /gl_FragColor\s*=/,
  ];
  for (const re of required) {
    if (!re.test(source)) {
      throw new Error(`[postfx] fragment shader missing pattern: ${re.source}`);
    }
  }
  if (!/void\s+main\s*\(/.test(source)) {
    throw new Error('[postfx] fragment shader missing main()');
  }
}
