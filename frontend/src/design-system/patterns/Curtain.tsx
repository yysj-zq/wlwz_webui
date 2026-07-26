/**
 * Curtain —— 戏台开帘效果 pattern（DS4）。
 *
 *  - 复用 motion recipe 的 Curtain，但加上自动相位推进（mount → opening → open）
 *  - 受控 / 非受控双模
 *  - 开 / 关完成后触发 onOpenChange
 */
import { forwardRef, useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../primitives/utils';
import { Curtain as MotionCurtain, type CurtainPhase } from '../motion/recipes';

export interface CurtainProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 受控相位。 */
  phase?: CurtainPhase;
  /** 默认相位（defaultOpen=true → opening）。 */
  defaultOpen?: boolean;
  onPhaseChange?: (phase: CurtainPhase) => void;
  /** opening 相位停留时间（ms），过后自动转 open；0 表示不自动。 */
  openAfterMs?: number;
  /** 渲染标签；默认 div。 */
  children: ReactNode;
}

export const CurtainPattern = forwardRef<HTMLDivElement, CurtainProps>(function CurtainPattern(
  {
    phase: controlledPhase,
    defaultOpen = true,
    onPhaseChange,
    openAfterMs = 0,
    children,
    className,
    style,
    ...rest
  },
  ref,
) {
  const [internal, setInternal] = useState<CurtainPhase>(defaultOpen ? 'opening' : 'open');
  const phase = controlledPhase ?? internal;

  useEffect(() => {
    if (!controlledPhase) {
      setInternal(defaultOpen ? 'opening' : 'open');
    }
  }, [defaultOpen, controlledPhase]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  useEffect(() => {
    if (phase === 'opening' && openAfterMs > 0) {
      const t = setTimeout(() => {
        if (!controlledPhase) setInternal('open');
      }, openAfterMs);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, openAfterMs, controlledPhase]);

  return (
    <div
      ref={ref}
      className={cn('ds-pattern-curtain', className)}
      style={{ minHeight: '160px', position: 'relative', ...style }}
      {...rest}
    >
      <MotionCurtain phase={phase}>
        <div style={{ padding: 'var(--size-spacing-6)' }}>{children}</div>
      </MotionCurtain>
    </div>
  );
});

export default CurtainPattern;
