/**
 * Stage §runtime barrel（Phase 2 VS1）。
 *
 * 包含：
 *  - StageRuntime: Phaser-agnostic 接口 + BaseStageRuntime（in-memory 实现）
 *  - PhaserRuntime: 真实 Phaser 4 实现
 *  - 工厂 / 快照 / 事件类型
 */
export * from './StageRuntime';
export * from './PhaserRuntime';
export * from './StageSystems';
