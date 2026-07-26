import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'jest-axe';
import { AuthProvider } from '@features/auth/AuthProvider';
import { AuthPage } from '@pages/auth/AuthPage';
import './setup-axe';

function renderAuth() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('PP5 a11y — AuthForm', () => {
  it('associates labels with email/password fields and passes axe', async () => {
    const { container } = renderAuth();

    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
