/**
 * jest-axe@10 ships no typings; declare the subset used by a11y tests.
 * Prefer this over disabling @typescript-eslint/no-unsafe-* for the suite.
 */
declare module 'jest-axe' {
  import type { AxeResults, RunOptions } from 'axe-core';

  export type JestAxe = (html: Element | string, options?: RunOptions) => Promise<AxeResults>;

  export const axe: JestAxe;

  export const toHaveNoViolations: {
    toHaveNoViolations: (received?: AxeResults) => {
      pass: boolean;
      message: () => string;
    };
  };
}
