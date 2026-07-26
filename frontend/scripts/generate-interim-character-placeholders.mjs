/**
 * 生成角色 interim 占位资产（与运行时帧约定对齐，可同路径 drop-in 替换）。
 *
 * 产出（每个 slug）：
 *   atlas.png        — 64×96 实心色块（可见色块，非 8×8 碎点）
 *   atlas_normal.png — 同尺寸平法线 RGB(128,128,255)
 *   atlas.json       — 全部帧 rect 落在 0,0,64,96；meta 标记 placeholder
 *
 * 用法：node scripts/generate-interim-character-placeholders.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHAR_ROOT = join(__dirname, '../public/assets/characters');

const FRAME_W = 64;
const FRAME_H = 96;
const DIRECTIONS = ['south', 'east', 'north', 'west'];
const ANIMATIONS = {
  idle: 4,
  walk: 4,
  speak: 4,
};

/** 已有真图的角色：跳过，不覆盖。 */
const SKIP = new Set(['baizhantang']);

/** 未就绪角色 → 区分色（同福色系近似，便于舞台辨认）。 */
const PLACEHOLDERS = {
  tongxiangyu: [0x8b, 0x1a, 0x1a, 0xff], // lacquer
  guofurong: [0xc4, 0x5c, 0x6a, 0xff],
  lvxiucai: [0x5c, 0x6b, 0x7a, 0xff],
  lidazui: [0x5c, 0x3a, 0x20, 0xff],
  moxiaobei: [0xe0, 0x98, 0x40, 0xff],
  zhuwushuang: [0x3d, 0x5a, 0x6c, 0xff],
  yanxiaoliu: [0x6a, 0x7a, 0x4a, 0xff],
  xingyusen: [0x4a, 0x5c, 0x78, 0xff],
};

const FLAT_NORMAL = [128, 128, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** 写未压缩过滤行的 RGBA PNG。 */
function writeRgbaPng(path, width, height, rgba) {
  const [r, g, b, a] = rgba;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

function buildAtlasJson() {
  const frames = {};
  for (const dir of DIRECTIONS) {
    for (const [anim, count] of Object.entries(ANIMATIONS)) {
      for (let i = 0; i < count; i++) {
        const key = `${dir}/${anim}/${i}`;
        frames[key] = {
          frame: { x: 0, y: 0, w: FRAME_W, h: FRAME_H },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: FRAME_W, h: FRAME_H },
          sourceSize: { w: FRAME_W, h: FRAME_H },
        };
      }
    }
  }
  return {
    frames,
    meta: {
      app: 'placeholder',
      version: '1.1',
      image: 'atlas.png',
      format: 'RGBA8888',
      size: { w: FRAME_W, h: FRAME_H },
      scale: '1',
      notes:
        'Interim solid-block placeholder. All frames alias 0,0,64,96. Replace atlas.png + atlas_normal.png + atlas.json together when art lands.',
    },
    frameSize: { w: FRAME_W, h: FRAME_H },
  };
}

function main() {
  const atlasJson = buildAtlasJson();
  for (const [slug, rgba] of Object.entries(PLACEHOLDERS)) {
    if (SKIP.has(slug)) continue;
    const dir = join(CHAR_ROOT, slug);
    mkdirSync(dir, { recursive: true });
    writeRgbaPng(join(dir, 'atlas.png'), FRAME_W, FRAME_H, rgba);
    writeRgbaPng(join(dir, 'atlas_normal.png'), FRAME_W, FRAME_H, FLAT_NORMAL);
    writeFileSync(join(dir, 'atlas.json'), `${JSON.stringify(atlasJson, null, 2)}\n`);
    console.log(`wrote ${slug}: ${FRAME_W}x${FRAME_H} placeholder`);
  }
}

main();
