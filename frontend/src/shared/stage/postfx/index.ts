/**
 * Stage §postfx barrel（Phase 2 VS5 Spec §Bloom + Vignette + Color Grading）。
 *
 * 提供：
 *  - `PostFXPipeline` 类与工厂（快照）
 *  - Phaser 4 内置 Filters 挂载（`PostFXCameraFilters`）
 *  - GLSL shader 源（备用自定义 grading；主路径用内置 Filters）
 *  - 默认 config + `derivePostFXPreset(timeOfDay, weather)`
 *  - `mergePostFXConfig` 用于 partial 更新
 */
export * from './PostFXPipeline';
export * from './PostFXCameraFilters';
export * from './shaders';
