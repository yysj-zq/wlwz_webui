/**
 * Stage §lighting barrel（Phase 2 VS4 Spec §HD-2D 光照）。
 *
 * 提供：
 *  - `Light2DPipeline` 类与工厂；快照驱动 ambient / lights / flicker。
 *  - Phaser 4 WebGL Filter（`Light2DFilter` + CPU `bakeLightMap`）。
 *  - GLSL shader 源（vertex / fragment）— 通过 `./shaders` 子 barrel。
 *  - publicState 解读工具：`readTimeOfDay` / `readWeather`。
 *  - 调色板（`DEFAULT_LIGHTING_PALETTE`）+ ambient 派生。
 *  - WebGL probe（`probeWebGL`）诊断；渲染失败由 StageSystems 门闸，禁止 CSS 假光照。
 */
export * from './Light2DPipeline';
export * from './bakeLightMap';
export * from './parseLightingJson';
export * from './Light2DFilter';
export * from './shaders';
