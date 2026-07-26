import { describe, expect, it } from 'vitest';
import {
  isPointBlocked,
  parseCollisionDocument,
  pointInPolygon,
  pointInRect,
  rasterizeCollisionTiles,
} from '@shared/stage/assets/collision';
import {
  isTileBlocked,
  stepInDirection,
  withCollisionTiles,
  defaultMapCatalog,
} from '@shared/stage/assets/mapsCatalog';

describe('collision parse + geometry', () => {
  it('parses polygon and rect shapes', () => {
    const doc = parseCollisionDocument({
      blocked: [
        {
          kind: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
        },
        { kind: 'rect', x: 4, y: 4, w: 1, h: 1 },
        { kind: 'rect', x: 9, y: 9, w: -1, h: 1 },
      ],
    });
    expect(doc.blocked).toHaveLength(2);
    expect(doc.blocked[0]?.kind).toBe('polygon');
    expect(doc.blocked[1]?.kind).toBe('rect');
  });

  it('detects point in polygon / rect', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(pointInPolygon(1, 1, square)).toBe(true);
    expect(pointInPolygon(3, 1, square)).toBe(false);
    expect(pointInRect(4.5, 4.5, { x: 4, y: 4, w: 1, h: 1 })).toBe(true);
    expect(pointInRect(5.5, 4.5, { x: 4, y: 4, w: 1, h: 1 })).toBe(false);
  });

  it('rasterizes blocked tiles and blocks player steps', () => {
    const doc = parseCollisionDocument({
      blocked: [{ kind: 'rect', x: 1, y: 1, w: 1, h: 1 }],
    });
    const tiles = rasterizeCollisionTiles(doc, 4, 4);
    expect(tiles.some((t) => t.x === 1 && t.y === 1)).toBe(true);
    expect(isPointBlocked(1.5, 1.5, doc.blocked)).toBe(true);

    const base = defaultMapCatalog()[0]!;
    const spec = withCollisionTiles(base, tiles);
    expect(isTileBlocked(spec, { x: 1, y: 1 }, true)).toBe(true);
    const hit = stepInDirection(spec, { x: 1, y: 0 }, 'south', true);
    expect(hit.hit).toBe(true);
    expect(hit.x).toBe(1);
    expect(hit.y).toBe(0);
    const ok = stepInDirection(spec, { x: 0, y: 0 }, 'east', true);
    expect(ok.hit).toBe(false);
    expect(ok).toEqual({ x: 1, y: 0, hit: false });
  });
});
