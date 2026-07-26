/**
 * Stage §camera barrel（Phase 2 VS7 Spec §CameraDirector 相机导演）。
 *
 * 提供：
 *  - `CameraDirector` 类与工厂
 *  - 指令队列（focus / shake / curtain / follow）
 *  - 平滑插值 + 死区跟随
 *  - publicState 覆写读取
 *  - 与 StageRuntime 的集成 helper（`bindCameraDirectorToRuntime` 等）
 */
export * from './CameraDirector';
