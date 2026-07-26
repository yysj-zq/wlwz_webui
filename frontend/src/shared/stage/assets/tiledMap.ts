/**
 * Tiled map.json 解析辅助：定位 imagelayer 整图背景。
 *
 * PhaserRuntime.loadScene 用此解析 manifest → map.json → background PNG，
 * 不走 CSS 假地图路径。
 */

/** Tiled imagelayer（仅摘渲染所需字段）。 */
export type TiledImageLayer = {
  readonly type: 'imagelayer';
  readonly name: string;
  readonly image: string;
  readonly imagewidth?: number;
  readonly imageheight?: number;
  readonly visible?: boolean;
};

/** Tiled map 根对象（宽松）。 */
export type TiledMapJson = {
  readonly width?: number;
  readonly height?: number;
  readonly tilewidth?: number;
  readonly tileheight?: number;
  readonly layers?: readonly unknown[];
};

/** loadScene 渲染背景所需的解析结果。 */
export type MapBackgroundSpec = {
  /** 背景图绝对路径（站点根相对，如 `/assets/maps/tongfu_inn/tongfu_inn.png`）。 */
  readonly imageUrl: string;
  /** Phaser texture key。 */
  readonly textureKey: string;
  /** 相机 bounds / 背景尺寸（优先 image 像素，否则 tile 网格）。 */
  readonly boundsWidth: number;
  readonly boundsHeight: number;
};

/**
 * 把相对路径解析到 map.json 所在目录。
 * `tongfu_inn.png` + `/assets/maps/tongfu_inn/map.json`
 * → `/assets/maps/tongfu_inn/tongfu_inn.png`
 */
export function resolveUrlRelativeTo(baseUrl: string, relativeOrAbsolute: string): string {
  if (
    /^https?:\/\//i.test(relativeOrAbsolute) ||
    relativeOrAbsolute.startsWith('/') ||
    relativeOrAbsolute.startsWith('data:')
  ) {
    return relativeOrAbsolute;
  }
  const lastSlash = baseUrl.lastIndexOf('/');
  const dir = lastSlash >= 0 ? baseUrl.slice(0, lastSlash + 1) : '/';
  return `${dir}${relativeOrAbsolute}`;
}

function isImageLayer(layer: unknown): layer is TiledImageLayer {
  if (!layer || typeof layer !== 'object') return false;
  const l = layer as Record<string, unknown>;
  return l.type === 'imagelayer' && typeof l.image === 'string' && l.image.length > 0;
}

/**
 * 从 Tiled layers 中取 imagelayer：优先 name === 'background'，否则第一个可见 imagelayer。
 */
export function findImageLayer(map: TiledMapJson): TiledImageLayer | null {
  const layers = map.layers;
  if (!layers || layers.length === 0) return null;

  const imageLayers = layers.filter(isImageLayer);
  if (imageLayers.length === 0) return null;

  const named = imageLayers.find((l) => l.name === 'background');
  if (named) return named;

  const visible = imageLayers.find((l) => l.visible !== false);
  return visible ?? imageLayers[0] ?? null;
}

/**
 * 从已 fetch 的 Tiled JSON + map.json URL 派生背景加载规格。
 * 缺 imagelayer / 无法推算尺寸时返回 null（调用方走门闸）。
 */
export function resolveMapBackground(
  map: TiledMapJson,
  mapJsonUrl: string,
  sceneId: string,
): MapBackgroundSpec | null {
  const layer = findImageLayer(map);
  if (!layer) return null;

  const imageUrl = resolveUrlRelativeTo(mapJsonUrl, layer.image);
  const tileW = typeof map.tilewidth === 'number' && map.tilewidth > 0 ? map.tilewidth : 48;
  const tileH = typeof map.tileheight === 'number' && map.tileheight > 0 ? map.tileheight : 48;
  const gridW = typeof map.width === 'number' && map.width > 0 ? map.width * tileW : 0;
  const gridH = typeof map.height === 'number' && map.height > 0 ? map.height * tileH : 0;
  const imgW = typeof layer.imagewidth === 'number' && layer.imagewidth > 0 ? layer.imagewidth : 0;
  const imgH =
    typeof layer.imageheight === 'number' && layer.imageheight > 0 ? layer.imageheight : 0;

  const boundsWidth = imgW || gridW;
  const boundsHeight = imgH || gridH;
  if (boundsWidth <= 0 || boundsHeight <= 0) return null;

  return Object.freeze({
    imageUrl,
    textureKey: `map-bg:${sceneId}`,
    boundsWidth,
    boundsHeight,
  });
}
