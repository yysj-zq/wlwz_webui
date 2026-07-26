/**
 * Light2D fragment shader（Phase 2 VS4 Spec §HD-2D 光照）。
 *
 * Phaser 4 `BaseFilterShader` 约定：
 *  - 主场景色：`uMainSampler` + `outTexCoord`（由 SimpleTextureVert 提供）
 *  - 额外纹理：`u_normalMap`（slot 1）、`u_lightMap`（slot 2）
 *
 * 光照：
 *  - CPU 烘焙 `u_lightMap`（灯笼 / 窗户累加）
 *  - `u_ambientColor` + `u_ambientIntensity`：昼夜 / 天气基调
 *  - `u_normalStrength=0`：占位平法线或缺失时关闭凹凸，仍走本 WebGL filter
 *
 * 输出：`scene.rgb * lit`（乘法光照，非 CSS / 背景色近似）
 */
export const LIGHT2D_FRAGMENT_SOURCE = /* glsl */ `
precision mediump float;

uniform sampler2D uMainSampler;
uniform sampler2D u_normalMap;
uniform sampler2D u_lightMap;

uniform vec3 u_ambientColor;
uniform float u_ambientIntensity;

uniform float u_lightScale;
uniform float u_normalStrength;

varying vec2 outTexCoord;

void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);

  // normalMap RGB(128,128,255) -> normal (0,0,1) in tangent space
  vec3 normal = normalize(texture2D(u_normalMap, outTexCoord).rgb * 2.0 - 1.0);
  // 占位平法线 / 缺失：strength=0 时固定上向，无凹凸
  if (u_normalStrength < 0.001) {
    normal = vec3(0.0, 0.0, 1.0);
  }

  vec4 light = texture2D(u_lightMap, outTexCoord);

  vec3 ambient = u_ambientColor * u_ambientIntensity;

  vec3 skyDir = normalize(vec3(0.4, 0.4, 0.85));
  float sky = clamp(dot(normal, skyDir), 0.0, 1.0);

  vec3 lit = ambient
    + light.rgb * light.a * u_lightScale
    + vec3(sky) * sky * u_normalStrength * 0.25;

  gl_FragColor = vec4(clamp(base.rgb * lit, 0.0, 1.0), base.a);
}
`;

/**
 * 校验 fragment shader 关键 uniform / 主函数存在。
 * 不做完整 GLSL 解析；仅关键字最小化校验。
 */
export function assertLight2DFragmentShape(source: string): void {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('[lighting] fragment shader source is empty');
  }
  const required = [
    /uniform\s+sampler2D\s+uMainSampler\b/,
    /uniform\s+sampler2D\s+u_normalMap\b/,
    /uniform\s+sampler2D\s+u_lightMap\b/,
    /uniform\s+vec3\s+u_ambientColor\b/,
    /uniform\s+float\s+u_ambientIntensity\b/,
    /uniform\s+float\s+u_normalStrength\b/,
    /gl_FragColor\s*=/,
  ];
  for (const re of required) {
    if (!re.test(source)) {
      throw new Error(`[lighting] fragment shader missing pattern: ${re.source}`);
    }
  }
  if (!/void\s+main\s*\(/.test(source)) {
    throw new Error('[lighting] fragment shader missing main()');
  }
}
