import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  emptyManifest,
  parseAtlasJson,
  resolveCharacterSlug,
  findImageLayer,
  resolveMapBackground,
  resolveUrlRelativeTo,
  type AssetManifest,
} from '@shared/stage/assets';

function characterManifest(): AssetManifest {
  return {
    version: 1,
    maps: {
      tongfu_inn: {
        json: '/assets/maps/tongfu_inn/map.json',
        tileset: '/assets/maps/tongfu_inn/tileset.png',
      },
    },
    characters: {
      baizhantang: {
        atlas: '/assets/characters/baizhantang/atlas.png',
        meta: '/assets/characters/baizhantang/atlas.json',
      },
    },
    objects: {},
  };
}

describe('tiledMap background helpers', () => {
  it('resolves relative image urls against map.json location', () => {
    expect(resolveUrlRelativeTo('/assets/maps/tongfu_inn/map.json', 'tongfu_inn.png')).toBe(
      '/assets/maps/tongfu_inn/tongfu_inn.png',
    );
    expect(resolveUrlRelativeTo('/assets/maps/tongfu_inn/map.json', '/abs.png')).toBe('/abs.png');
  });

  it('prefers imagelayer named background', () => {
    const layer = findImageLayer({
      layers: [
        { type: 'imagelayer', name: 'other', image: 'a.png' },
        {
          type: 'imagelayer',
          name: 'background',
          image: 'tongfu_inn.png',
          imagewidth: 10,
          imageheight: 20,
        },
      ],
    });
    expect(layer?.name).toBe('background');
    expect(layer?.image).toBe('tongfu_inn.png');
  });

  it('builds MapBackgroundSpec from tiled json', () => {
    const spec = resolveMapBackground(
      {
        width: 57,
        height: 31,
        tilewidth: 48,
        tileheight: 48,
        layers: [
          {
            type: 'imagelayer',
            name: 'background',
            image: 'tongfu_inn.png',
            imagewidth: 2741,
            imageheight: 1529,
          },
        ],
      },
      '/assets/maps/tongfu_inn/map.json',
      'tongfu_inn',
    );
    expect(spec).toEqual({
      imageUrl: '/assets/maps/tongfu_inn/tongfu_inn.png',
      textureKey: 'map-bg:tongfu_inn',
      boundsWidth: 2741,
      boundsHeight: 1529,
    });
  });
});

describe('atlas slug + parse', () => {
  it('resolves backend slug via exact manifest match', () => {
    const manifest = characterManifest();
    expect(resolveCharacterSlug(manifest, 'baizhantang')).toBe('baizhantang');
    expect(resolveCharacterSlug(manifest, 'characters:baizhantang/atlas')).toBe('baizhantang');
    expect(resolveCharacterSlug(manifest, 'bai-zhantang')).toBeNull();
    expect(resolveCharacterSlug(manifest, 'counter')).toBeNull();
    expect(resolveCharacterSlug(emptyManifest(), 'baizhantang')).toBeNull();
  });

  it('parses TexturePacker-style atlas.json frames', () => {
    const meta = parseAtlasJson(
      {
        frames: {
          'south/idle/0': {
            frame: { x: 0, y: 0, w: 310, h: 310 },
          },
          'east/idle/0': {
            frame: { x: 310, y: 0, w: 310, h: 310 },
          },
        },
        meta: {
          image: 'atlas.png',
          size: { w: 1860, h: 2480 },
          frameSize: { w: 310, h: 310 },
        },
      },
      '/assets/characters/baizhantang/atlas.png',
    );
    expect(meta?.frameSize).toEqual({ w: 310, h: 310 });
    expect(meta?.frames['south/idle/0']).toEqual({ x: 0, y: 0, w: 310, h: 310 });
    expect(meta?.frames['east/idle/0']?.x).toBe(310);
  });

  it('interim character placeholders keep every frame inside meta.size', async () => {
    const root = join(process.cwd(), 'public/assets/characters');
    const placeholders = [
      'tongxiangyu',
      'guofurong',
      'lvxiucai',
      'lidazui',
      'moxiaobei',
      'zhuwushuang',
      'yanxiaoliu',
      'xingyusen',
    ];
    for (const slug of placeholders) {
      const raw = JSON.parse(await readFile(join(root, slug, 'atlas.json'), 'utf8')) as {
        frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
        meta: { app: string; size: { w: number; h: number } };
      };
      expect(raw.meta.app).toBe('placeholder');
      const { w: sw, h: sh } = raw.meta.size;
      expect(sw).toBeGreaterThan(0);
      expect(sh).toBeGreaterThan(0);
      for (const [key, entry] of Object.entries(raw.frames)) {
        const f = entry.frame;
        expect(f.x + f.w, `${slug} ${key}`).toBeLessThanOrEqual(sw);
        expect(f.y + f.h, `${slug} ${key}`).toBeLessThanOrEqual(sh);
      }
      const meta = parseAtlasJson(raw, `/assets/characters/${slug}/atlas.png`);
      expect(meta?.frames['south/idle/0']).toMatchObject({ x: 0, y: 0, w: 64, h: 96 });
    }
  });
});
