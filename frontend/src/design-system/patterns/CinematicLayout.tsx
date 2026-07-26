/**
 * CinematicLayout pattern —— Phase 4 GR3 §电影级布局。
 *
 * 设计目标：
 *  - 在 GameShell 外层套一个"电影画框"：暗角（vignette）+ 纸噪点（paper noise）+ 灯笼暖光叠加
 *  - **纯 CSS / SVG** 实现：零依赖、零网络；不破坏 Phaser runtime 的 canvas
 *  - **可切换 tone**：暖（默认）/ 夜话（ink）/ 雾（fog）；由 Phase 2 VS4 时间 / 天气派生
 *  - **a11y**：role="presentation"，aria-hidden；不破坏屏幕阅读器朗读 GameShell 主内容
 *
 * 用法：
 * ```tsx
 * <CinematicLayout tone="warm" showNoise vignette>
 *   <GameShell ... />
 * </CinematicLayout>
 * ```
 *
 * 与 GR7 AssetGate 的关系：AssetGate 在 manifest 未就绪时**整层**覆盖；
 * CinematicLayout 是正常状态下的装饰层，二者独立。
 */
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

export type CinematicTone = 'warm' | 'ink' | 'fog' | 'frost';

/**
 * CinematicLayout 装饰层配置。
 *
 *  - `tone` 决定主色（暗角色 / 暖光色 / 噪点透明度）
 *  - `showVignette` / `showNoise` / `showLanternGlow` 都是"开关"，便于设计师调参
 *  - `intensity` ∈ [0, 1]：所有效果的强度系数；测试 / 调试用
 */
export interface CinematicLayoutProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone?: CinematicTone;
  readonly showVignette?: boolean;
  readonly showNoise?: boolean;
  readonly showLanternGlow?: boolean;
  readonly intensity?: number;
  readonly children: ReactNode;
}

const TONE_VARS: Record<CinematicTone, CSSProperties> = {
  warm: {
    // 暗角色（与 design tokens 锚定：lacquer + ink）
    ['--cinema-vignette' as never]: 'rgba(26, 14, 10, 0.55)',
    ['--cinema-lantern' as never]: 'rgba(255, 176, 96, 0.18)',
    ['--cinema-noise-opacity' as never]: '0.06',
  },
  ink: {
    ['--cinema-vignette' as never]: 'rgba(8, 4, 2, 0.72)',
    ['--cinema-lantern' as never]: 'rgba(255, 140, 60, 0.22)',
    ['--cinema-noise-opacity' as never]: '0.08',
  },
  fog: {
    ['--cinema-vignette' as never]: 'rgba(184, 184, 188, 0.45)',
    ['--cinema-lantern' as never]: 'rgba(255, 220, 180, 0.10)',
    ['--cinema-noise-opacity' as never]: '0.04',
  },
  frost: {
    ['--cinema-vignette' as never]: 'rgba(40, 60, 90, 0.5)',
    ['--cinema-lantern' as never]: 'rgba(220, 235, 255, 0.10)',
    ['--cinema-noise-opacity' as never]: '0.05',
  },
};

/**
 * 单层 overlay：每层 absolute fill 父容器；pointer-events: none 不阻挡交互。
 */
const overlayBaseStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
};

/**
 * 暗角层（radial-gradient）。
 */
const vignetteStyle = (intensity: number): CSSProperties => ({
  ...overlayBaseStyle,
  background:
    'radial-gradient(ellipse at center, ' +
    'rgba(0,0,0,0) 35%, ' +
    'rgba(0,0,0,0.18) 60%, ' +
    'var(--cinema-vignette) 95%)',
  opacity: Math.max(0, Math.min(1, intensity)),
  mixBlendMode: 'multiply',
});

/**
 * 灯笼暖光层（径向顶部光晕）。
 */
const lanternStyle = (intensity: number): CSSProperties => ({
  ...overlayBaseStyle,
  background:
    'radial-gradient(ellipse 60% 40% at 50% -10%, ' +
    'var(--cinema-lantern) 0%, ' +
    'rgba(255, 176, 96, 0.04) 50%, ' +
    'transparent 80%)',
  opacity: Math.max(0, Math.min(1, intensity)),
  mixBlendMode: 'screen',
});

/**
 * 纸噪点层（SVG 重复平铺，CSS filter 微调对比）。
 *
 * 注意：本层用 inline `<svg>` 作为 background-image，避免 1×1 png 静态资源。
 * 渲染 30×30 的 turbulence pattern，重复铺满；视觉上接近"颗粒噪点"。
 */
const noiseSvgDataUrl =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">' +
      '<filter id="n">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>' +
      '<feColorMatrix type="matrix" values="0 0 0 0 0.96  0 0 0 0 0.92  0 0 0 0 0.82  0 0 0 0.85 0"/>' +
      '</filter>' +
      '<rect width="100%" height="100%" filter="url(#n)" opacity="0.85"/>' +
      '</svg>',
  );

const noiseStyle = (intensity: number): CSSProperties => ({
  ...overlayBaseStyle,
  backgroundImage: `url("${noiseSvgDataUrl}")`,
  backgroundRepeat: 'repeat',
  // CSS var 不能喂给 parseFloat；默认噪点透明度与 --cinema-noise-opacity 对齐。
  opacity: Math.max(0, Math.min(1, intensity)) * 0.06,
  mixBlendMode: 'overlay',
});

/**
 * 顶层容器：relative + overflow: hidden；子内容照常渲染，叠层在子内容之上。
 */
const containerBaseStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: 0,
  isolation: 'isolate', // 创建独立 stacking context，避免污染外层
};

/**
 * CinematicLayout —— 电影级画框包装组件。
 */
export const CinematicLayout = forwardRef<HTMLDivElement, CinematicLayoutProps>(
  function CinematicLayout(
    {
      tone = 'warm',
      showVignette = true,
      showNoise = true,
      showLanternGlow = true,
      intensity = 1,
      className,
      style,
      children,
      ...rest
    },
    ref,
  ) {
    const toneVars = TONE_VARS[tone];
    const composed: CSSProperties = {
      ...containerBaseStyle,
      ...toneVars,
      ...style,
    };
    return (
      <div
        ref={ref}
        className={className}
        style={composed}
        data-cinema-tone={tone}
        data-cinema-vignette={showVignette || undefined}
        data-cinema-noise={showNoise || undefined}
        data-cinema-lantern={showLanternGlow || undefined}
        data-cinema-intensity={intensity.toFixed(2)}
        {...rest}
      >
        {children}
        {showVignette ? (
          <div aria-hidden data-testid="cinema-vignette" style={vignetteStyle(intensity)} />
        ) : null}
        {showLanternGlow ? (
          <div aria-hidden data-testid="cinema-lantern" style={lanternStyle(intensity)} />
        ) : null}
        {showNoise ? (
          <div aria-hidden data-testid="cinema-noise" style={noiseStyle(intensity)} />
        ) : null}
      </div>
    );
  },
);

export default CinematicLayout;
