/**
 * Stage 模块顶层 barrel（Phase 2 VS1/VS2/VS3/VS4/VS5/VS6/VS7）。
 *
 * 子模块：
 *  - runtime/    StageRuntime 接口 + PhaserRuntime 实现（VS1）
 *  - scale/      整数倍缩放（VS1）
 *  - assets/     manifest + 加载门闸 + 品牌化错误（VS1）
 *  - world/      diff patch 算法（VS2）
 *  - speech/     短气泡工厂（VS3）
 *  - lighting/   Light2D 法线光照 pipeline + shader 源（VS4）
 *  - postfx/     Bloom + Vignette + Color Grading pipeline + shader 源（VS5）
 *  - particles/  氛围粒子（尘埃/炊烟/灯火摇曳；timeOfDay/weather 驱动）（VS6）
 *  - camera/     CameraDirector 相机导演（follow/focus/shake/curtain）（VS7）
 *
 * 不允许从此 barrel 直接 re-export 副作用模块（如 phaser 全量）
 * — 调用方按需 import 各自子目录。
 */

export * from './runtime';
export * from './scale';
export * from './assets';
export * from './world';
export * from './speech';
export * from './lighting';
export * from './postfx';
export * from './particles';
export * from './camera';
