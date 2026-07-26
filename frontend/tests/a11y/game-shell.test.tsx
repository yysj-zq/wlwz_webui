import { describe, it, expect, vi } from 'vitest';
import { forwardRef } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';
import './setup-axe';

// GameShell 内部是相对路径 import './StageViewport'；按解析后的文件路径 mock。
vi.mock('../../src/widgets/game-shell/StageViewport', () => ({
  StageViewport: forwardRef(function StageViewportStub(_props: unknown, _ref: unknown) {
    return <div role="img" data-testid="stage-viewport-stub" aria-label="舞台视口（测试桩）" />;
  }),
}));

const idleQuery = {
  data: undefined,
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
} as const;

describe('PP5 a11y — GameShell', () => {
  it('exposes application role and passes axe with stubbed data hooks', async () => {
    const { GameShell } = await import('@widgets/game-shell/GameShell');
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={client}>
        <GameShell
          conversationId={null}
          ariaLabel="戏台"
          __testHooks={{
            useWorld: () => idleQuery as never,
            useTimeline: () => ({ ...idleQuery, data: [] }) as never,
            useRoles: () => ({ ...idleQuery, data: [] }) as never,
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('application', { name: '戏台' })).toBeInTheDocument();
    expect(screen.getByTestId('game-shell')).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
