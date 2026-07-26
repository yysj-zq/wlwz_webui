/**
 * `pnpm openapi` entry: resolve OpenAPI JSON once, then run orval once.
 */
import { execSync } from 'node:child_process';

execSync('node scripts/resolve-openapi.mjs', { stdio: 'inherit' });
execSync('pnpm exec orval --config orval.config.ts', { stdio: 'inherit' });
