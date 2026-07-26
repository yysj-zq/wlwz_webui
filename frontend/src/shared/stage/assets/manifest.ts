/**
 * 资产 manifest 类型 + 缺资产品牌化门闸（Phase 2 VS1 Spec §资产 manifest/加载门闸）。
 *
 * 设计：
 *  - manifest 是纯描述性数据，描述"地图 / 角色 / 物件 / 音频"四类资产的 URL 集合。
 *  - `MissingAssetError` 是品牌化门闸的核心：缺资产时抛错，错误对象自带
 *    `brandCue = '戏未开场'` 文案 + `tone: 'lacquer'`，GameShell / 任何消费方只
 *    要 try/catch 即可统一显示，不用各做一份文案。
 *  - `manifestVersion` 用于门禁：未来扩 schema 不直接 break 老 manifest，靠
 *    loader 拒绝 `unsupportedVersion` 来 fail-fast。
 *
 * 加载门闸上下文（来自 Phase 2 §A 美术素材清单）：
 *   前端目录 `frontend/public/assets/manifest.json`，结构由本文件定义；
 *   assetKey 形如 `maps:tongfu_inn` / `characters:baizhantang/atlas`。
 *
 * 注意：本文件零依赖（仅 `lib: es2022`），可在 SSR / Web Worker 重复使用。
 */

/** 资产大类（决定它走哪条加载管线）。 */
export type AssetKind =
  | 'map' // Tiled JSON
  | 'tileset' // Tiled tileset PNG
  | 'lighting' // 灯光标注 JSON
  | 'collision'
  | 'atlas' // 角色精灵图集 PNG
  | 'normal' // 法线图 PNG
  | 'atlasMeta' // TexturePacker 帧定义 JSON
  | 'object' // 物件 PNG
  | 'audio'; // 音频文件

/** 资源状态机：pending → loading → ready；异常走 gate / failed。 */
export type AssetStatus =
  | 'pending' // 已知未开始
  | 'loading' // 加载中
  | 'ready' // 已就绪可渲染
  | 'gate' // 缺资产但走品牌化门闸（不抛错，仅显示"戏未开场"）
  | 'failed'; // 加载失败，抛错给上层

/** 一个 manifest 条目对应的 URL 子集。 */
export type MapManifestEntry = {
  readonly json: string;
  readonly tileset: string;
  readonly lighting?: string;
  readonly collision?: string;
};

export type CharacterManifestEntry = {
  readonly atlas: string;
  /** 法线图为可选项；缺失时不阻塞渲染（HD2D-Light 子阶段可选启用）。 */
  readonly normal?: string;
  readonly meta?: string;
};

export type ObjectManifestEntry = {
  readonly image: string;
};

export type AudioManifestEntry = {
  readonly url: string;
};

/**
 * 完整 manifest 描述文件。对应 `frontend/public/assets/manifest.json`。
 *
 * `version` 字段强制门禁：loader 在 version 不支持时直接拒绝，避免静默用
 * 新 field 但忽略老 field 的兼容噩梦。
 */
export type AssetManifest = {
  readonly version: number;
  readonly maps: Readonly<Record<string, MapManifestEntry>>;
  readonly characters: Readonly<Record<string, CharacterManifestEntry>>;
  readonly objects: Readonly<Record<string, ObjectManifestEntry>>;
  readonly audio?: Readonly<Record<string, AudioManifestEntry>>;
};

/** 当前唯一受支持的 manifest schema 版本。 */
export const MANIFEST_VERSION_SUPPORTED: number = 1;

/**
 * 单个资产指针的归一化形式（加载器内部的中间表示）。
 * 业务层不需要直接构造 — 由 `enumerate(manifest)` 产出。
 */
export type AssetPointer = {
  readonly assetKey: string;
  readonly kind: AssetKind;
  readonly url: string;
};

/** 缺资产品牌化门闸的"色调 token"，由 GameShell 翻译成 CSS / 主题变量。 */
export type BrandTone = 'lacquer' | 'mute';

/**
 * 缺资产错误：所有资产加载失败的统一载体。
 *
 * 关键设计：
 *   - 名字固定为 'MissingAssetError'，便于 `error.name` 判别
 *   - `brandCue` = '戏未开场' 是品牌化文案的核心，
 *     上层 catch 后直接渲染，不用再做 i18n
 *   - `reason` 区分 5 类：manifest 没填 / URL 404 / 超时 / 网络 / 被 abort
 */
export type MissingAssetReason =
  | 'NOT_IN_MANIFEST'
  | 'URL_NOT_FOUND'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'ABORTED'
  | 'UNSUPPORTED_MANIFEST_VERSION';

export type MissingAssetErrorInit = {
  readonly assetKey: string;
  readonly kind: AssetKind;
  readonly url: string;
  readonly reason: MissingAssetReason;
  readonly cause?: unknown;
};

/**
 * 缺资产错误。所有错误路径统一抛这一个，避免上游到处 try/catch 不同子类。
 *
 * 品牌化占位：在 dev / production 看到 MissingAssetError 均自动渲染
 * `brandCue = '戏未开场'`，由 `brandPlaceholderFor(assetKey)` 工厂生成。
 */
export class MissingAssetError extends Error {
  override readonly name = 'MissingAssetError' as const;
  readonly assetKey: string;
  readonly kind: AssetKind;
  readonly url: string;
  readonly reason: MissingAssetReason;
  readonly brandCue: string;
  readonly tone: BrandTone;

  constructor(init: MissingAssetErrorInit) {
    const where = `${init.kind}@${init.assetKey}`;
    const detail = `${init.reason} url=${init.url}`;
    super(`[asset] missing ${where}: ${detail}`);
    this.assetKey = init.assetKey;
    this.kind = init.kind;
    this.url = init.url;
    this.reason = init.reason;
    // 品牌化门闸文案（Phase 2 §A.7 节"戏未开场"）
    this.brandCue = '戏未开场';
    this.tone = 'lacquer';
  }
}

/**
 * 品牌化占位：当一个 assetKey 没在任何 manifest 命中、又确实需要被画出来时，
 * 用本工厂生成稳定占位（不是错误，是 UI 占位）。
 * 与 MissingAssetError 的差别：此处只用于"可选 / 装饰"型资产，
 * 缺核心资产仍应抛 MissingAssetError。
 */
export function brandPlaceholderFor(
  assetKey: string,
  tone: BrandTone = 'mute',
): { assetKey: string; cue: string; tone: BrandTone } {
  return Object.freeze({
    assetKey,
    cue: `${assetKey} · 戏未开场`,
    tone,
  });
}

/**
 * 把 manifest 摊平为 AssetPointer 列表，便于加载器一次性 preload。
 * 这是个纯函数（除枚举顺序），单测可直接对照。
 */
export function* enumerate(manifest: AssetManifest): Generator<AssetPointer, void, void> {
  for (const [mapId, entry] of Object.entries(manifest.maps)) {
    yield { assetKey: `maps:${mapId}`, kind: 'map', url: entry.json };
    yield { assetKey: `maps:${mapId}/tileset`, kind: 'tileset', url: entry.tileset };
    if (entry.lighting) {
      yield { assetKey: `maps:${mapId}/lighting`, kind: 'lighting', url: entry.lighting };
    }
    if (entry.collision) {
      yield { assetKey: `maps:${mapId}/collision`, kind: 'collision', url: entry.collision };
    }
  }

  for (const [slug, entry] of Object.entries(manifest.characters)) {
    yield { assetKey: `characters:${slug}/atlas`, kind: 'atlas', url: entry.atlas };
    if (entry.normal) {
      yield { assetKey: `characters:${slug}/normal`, kind: 'normal', url: entry.normal };
    }
    if (entry.meta) {
      yield { assetKey: `characters:${slug}/meta`, kind: 'atlasMeta', url: entry.meta };
    }
  }

  for (const [name, entry] of Object.entries(manifest.objects)) {
    yield { assetKey: `objects:${name}`, kind: 'object', url: entry.image };
  }

  if (manifest.audio) {
    for (const [name, entry] of Object.entries(manifest.audio)) {
      yield { assetKey: `audio:${name}`, kind: 'audio', url: entry.url };
    }
  }
}

/**
 * 缺资产时不抛错，转为返回 status='gate'，供 GameShell / 任何消费方
 * 选择"先静音渲染 + 显示戏未开场 loading" 还是"放弃渲染"。
 *
 * 这是 `onMissing='GATE'` 模式的入口；具体策略在 loader 层实现。
 */
export function gateFor(
  assetKey: string,
  pointer: AssetPointer | null,
): {
  status: 'gate';
  placeholder: ReturnType<typeof brandPlaceholderFor>;
  pointer: AssetPointer | null;
} {
  return Object.freeze({
    status: 'gate' as const,
    placeholder: brandPlaceholderFor(assetKey),
    pointer,
  });
}

/**
 * 单测辅助：构造最小空 manifest（仅版本号）便于无网络跑门禁。
 * 真实使用方请走 `fetch('/assets/manifest.json')`。
 */
export function emptyManifest(): AssetManifest {
  return Object.freeze({
    version: MANIFEST_VERSION_SUPPORTED,
    maps: {},
    characters: {},
    objects: {},
  });
}
