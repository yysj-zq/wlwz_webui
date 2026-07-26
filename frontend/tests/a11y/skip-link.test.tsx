import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SkipLink, MainContent } from '@ds/a11y/SkipLink';
import './setup-axe';

describe('PP5 a11y — SkipLink', () => {
  it('exposes skip link to main content and has no axe violations', async () => {
    const { container } = render(
      <>
        <SkipLink targetId="main-content" />
        <MainContent id="main-content">
          <h1>主内容</h1>
        </MainContent>
      </>,
    );

    expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(container.querySelector('#main-content')).not.toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });
});
