/**
 * 解析地图 lighting.json 为 LightingLayerSpec。
 * 形状与 public/assets/maps/<mapId>/lighting.json 对齐。
 */
import type { LightColor, LightDef, LightKind, LightingLayerSpec } from './Light2DPipeline';

function isLightKind(v: unknown): v is LightKind {
  return v === 'lantern' || v === 'window' || v === 'ambient' || v === 'point';
}

function parseColor(raw: unknown): LightColor | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (
    typeof c.r !== 'number' ||
    typeof c.g !== 'number' ||
    typeof c.b !== 'number' ||
    typeof c.intensity !== 'number'
  ) {
    return null;
  }
  return Object.freeze({
    r: c.r,
    g: c.g,
    b: c.b,
    intensity: c.intensity,
  });
}

function parseLight(raw: unknown): LightDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (typeof l.id !== 'string' || !isLightKind(l.kind)) return null;
  if (typeof l.radius !== 'number') return null;
  const pos = l.position;
  if (!pos || typeof pos !== 'object') return null;
  const p = pos as Record<string, unknown>;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  const color = parseColor(l.color);
  if (!color) return null;
  let flicker: LightDef['flicker'];
  if (l.flicker && typeof l.flicker === 'object') {
    const f = l.flicker as Record<string, unknown>;
    if (typeof f.periodMs === 'number' && typeof f.amplitude === 'number') {
      flicker = Object.freeze({ periodMs: f.periodMs, amplitude: f.amplitude });
    }
  }
  return Object.freeze({
    id: l.id,
    kind: l.kind,
    position: Object.freeze({ x: p.x, y: p.y }),
    radius: l.radius,
    color,
    ...(flicker !== undefined ? { flicker } : {}),
  });
}

/**
 * 宽松解析 lighting.json。缺 ambient / lights 时返回 null（调用方保留 catalog 兜底）。
 */
export function parseLightingJson(data: unknown): LightingLayerSpec | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, unknown>;
  const ambient = parseColor(root.ambient);
  if (!ambient) return null;
  if (!Array.isArray(root.lights)) return null;
  const lights: LightDef[] = [];
  for (const item of root.lights) {
    const light = parseLight(item);
    if (light) lights.push(light);
  }
  if (lights.length === 0) return null;
  return Object.freeze({
    ambient,
    lights: Object.freeze(lights),
  });
}
