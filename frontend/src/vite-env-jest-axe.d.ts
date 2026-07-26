declare module 'jest-axe' {
  export type AxeResults = {
    violations: Array<{
      id: string;
      impact?: string | null;
      description: string;
      help: string;
      helpUrl: string;
      nodes: unknown[];
    }>;
  };

  export function configureAxe(
    options?: Record<string, unknown>,
  ): (html: Element | string) => Promise<AxeResults>;

  export function axe(html: Element | string): Promise<AxeResults>;

  export const toHaveNoViolations: {
    toHaveNoViolations(results?: AxeResults): {
      pass: boolean;
      message(): string;
    };
  };
}
