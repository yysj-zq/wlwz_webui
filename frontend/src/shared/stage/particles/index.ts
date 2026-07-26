/**
 * Stage §particles barrel（Phase 2 VS6 Spec §氛围粒子）。
 *
 * 提供：
 *  - `Atmosphere` 类与工厂；推进 / 订阅 / tick
 *  - emitter / particle / snapshot 类型
 *  - 默认 kind 调参 + density / visibility 派生
 *  - 确定性 PRNG（mulberry32）便于单测
 */
export * from './Atmosphere';
