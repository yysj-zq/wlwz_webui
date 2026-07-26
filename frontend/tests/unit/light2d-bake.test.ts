import { describe, expect, it } from 'vitest';
import {
  bakeLightMap,
  fillFlatNormalMap,
  isFlatNormalPlaceholder,
  FLAT_NORMAL_RGB,
} from '@shared/stage/lighting';
import {
  assertLight2DFragmentShape,
  LIGHT2D_FRAGMENT_SOURCE,
} from '@shared/stage/lighting/shaders';

describe('bakeLightMap', () => {
  it('accumulates a lantern into the lightMap buffer', () => {
    const baked = bakeLightMap({
      width: 64,
      height: 64,
      tileSize: 16,
      lights: [
        {
          id: 'l1',
          kind: 'lantern',
          position: { x: 2, y: 2 },
          radius: 24,
          color: { r: 1, g: 0.5, b: 0.2, intensity: 1 },
        },
      ],
      flickerOffsets: [0],
    });
    const cx = 2 * 16;
    const cy = 2 * 16;
    const i = (cy * 64 + cx) * 4;
    expect(baked.data[i + 3] ?? 0).toBeGreaterThan(0);
    expect(baked.data[i] ?? 0).toBeGreaterThan(100);
  });

  it('bakes lights in camera view space when scroll/zoom are set', () => {
    const baked = bakeLightMap({
      width: 64,
      height: 64,
      tileSize: 16,
      scrollX: 16,
      scrollY: 16,
      zoom: 1,
      lights: [
        {
          id: 'l1',
          kind: 'lantern',
          position: { x: 2, y: 2 },
          radius: 24,
          color: { r: 1, g: 0.5, b: 0.2, intensity: 1 },
        },
      ],
      flickerOffsets: [0],
    });
    // world (2,2)*16 → (32,32); minus scroll (16,16) → view (16,16)
    const i = (16 * 64 + 16) * 4;
    expect(baked.data[i + 3] ?? 0).toBeGreaterThan(0);
    // world-origin pixel should no longer hold the peak
    const origin = (32 * 64 + 32) * 4;
    expect(baked.data[i + 3] ?? 0).toBeGreaterThanOrEqual(baked.data[origin + 3] ?? 0);
  });

  it('detects flat normal placeholders', () => {
    const data = fillFlatNormalMap(4, 4);
    expect(isFlatNormalPlaceholder(data, 4, 4)).toBe(true);
    data[0] = 10;
    expect(isFlatNormalPlaceholder(data, 4, 4)).toBe(false);
    expect(FLAT_NORMAL_RGB.b).toBe(255);
  });
});

describe('Light2D fragment shader shape', () => {
  it('matches Phaser 4 BaseFilterShader uniforms', () => {
    expect(() => assertLight2DFragmentShape(LIGHT2D_FRAGMENT_SOURCE)).not.toThrow();
  });
});
