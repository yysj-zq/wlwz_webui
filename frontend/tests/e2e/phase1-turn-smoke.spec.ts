import { test, expect } from '@playwright/test';

/**
 * Play 门闸 / TurnHUD smoke。依赖 Vite webServer；不依赖真实后端。
 */
test.describe('Play turn smoke', () => {
  test('play route shows GameShell, ensure gate, or loading UI', async ({ page }) => {
    await page.goto('/play');

    await expect(page.getByTestId('play-page')).toBeVisible();

    const shell = page.getByTestId('game-shell');
    const gate = page.getByRole('region', { name: '未开始' });
    const loading = page.getByText('正在搭台…');
    const error = page.getByRole('alert', { name: '出错了' });

    await expect(shell.or(gate).or(loading).or(error).first()).toBeVisible();
  });

  test('play shell exposes TurnHUD when mounted', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByTestId('play-page')).toBeVisible();

    const shell = page.getByTestId('game-shell');
    if (await shell.isVisible().catch(() => false)) {
      const hud = page.getByRole('status').filter({ hasText: /候场|思考|开讲|落幕|过场|出错了/ });
      await expect(hud).toBeVisible();
      await expect(page.locator('[data-testid^="turn-hud-"]')).toBeVisible();
    } else {
      await expect(page.getByRole('region', { name: '未开始' })).toBeVisible();
    }
  });
});
