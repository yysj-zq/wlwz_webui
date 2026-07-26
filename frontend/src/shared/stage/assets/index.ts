/**
 * Stage §assets barrel（Phase 2 VS1）。
 *
 * 包含：
 *  - manifest: 类型 + MissingAssetError + 品牌化占位
 *  - loader: AssetLoader 状态机 + 加载门闸
 *  - atlas: Phase 4 GR1 角色图集 / 法线图契约（atlas+normal manifest）
 */
export * from './manifest';
export * from './loader';
export * from './atlas';
export * from './mapsCatalog';
export * from './collision';
export * from './tiledMap';
