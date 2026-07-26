/**
 * orval 生成代码的统一出口。
 * Phase 1 F1-1 维护：实际生成的文件由 `pnpm exec orval --config orval.config.ts` 产出（gitignored）。
 * 业务代码只从这个 barrel 导入，禁用从 generated/* 直接 import（保证生成代码可替换）。
 */
export * from './generated/api.schemas';
export * from './generated/api';
