import { describe, expect, it } from 'vitest';
import { computeIntegerWorldZoom } from '@shared/stage/scale';

describe('computeIntegerWorldZoom', () => {
  it('放大时取 floor(fit)，至少为 1', () => {
    expect(computeIntegerWorldZoom(1920, 1080, 640, 480)).toBe(2);
    expect(computeIntegerWorldZoom(700, 500, 640, 480)).toBe(1);
  });

  it('缩小时取 1/ceil(1/fit)，避免 0.89 分数 zoom', () => {
    // 2534×1363 vs 2741×1529 → fit≈0.89 → 1/2
    expect(computeIntegerWorldZoom(2534, 1363, 2741, 1529)).toBe(0.5);
    // 刚好一半
    expect(computeIntegerWorldZoom(1370, 764, 2740, 1528)).toBe(0.5);
  });

  it('极小视口继续降到更小的 1/n', () => {
    // fit≈0.327 → ceil(1/fit)=4 → 0.25
    expect(computeIntegerWorldZoom(900, 500, 2741, 1529)).toBe(0.25);
    // fit≈0.219 → ceil(1/fit)=5 → 0.2
    expect(computeIntegerWorldZoom(600, 400, 2741, 1529)).toBe(0.2);
  });
});
