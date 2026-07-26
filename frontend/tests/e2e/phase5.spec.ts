import { test, expect } from '@playwright/test';

/**
 * 关键路径 E2E —— 对齐现行 App：`/` = Chat 壳；TurnHUD 在 `/play`。
 */
test.describe('Product shell critical paths', () => {
  test('home loads chat experience without legacy nav links', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('chat-page')).toBeVisible();
    await expect(page.getByRole('link', { name: '进入戏台' })).toHaveCount(0);
  });

  test('auth page has accessible login form', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '邮箱' })).toBeVisible();
    await expect(page.getByLabel('密码')).toBeVisible();
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible();
  });

  test('roles page loads heading and status or list region', async ({ page }) => {
    await page.goto('/roles');
    await expect(page.getByTestId('roles-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: '角色配置' })).toBeVisible();

    const loading = page.getByRole('status').filter({ hasText: '正在加载角色' });
    const error = page.getByRole('alert').filter({ hasText: '角色加载失败' });
    const list = page.getByRole('list');

    await expect(loading.or(error).or(list).first()).toBeVisible();
  });

  test('play route loads shell or ensure-session gate without hanging', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByTestId('play-page')).toBeVisible();

    const shell = page.getByTestId('game-shell');
    const gate = page.getByRole('region', { name: '未开始' });
    const loading = page.getByText('正在搭台…');
    const error = page.getByRole('alert', { name: '出错了' });

    await expect(shell.or(gate).or(loading).or(error).first()).toBeVisible();
  });

  test('play route exposes TurnHUD status when game shell mounts', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByTestId('play-page')).toBeVisible();

    const shell = page.getByTestId('game-shell');
    const gate = page.getByRole('region', { name: '未开始' });
    const loading = page.getByText('正在搭台…');

    const shellVisible = await shell.isVisible().catch(() => false);
    if (shellVisible) {
      await expect(page.locator('[data-testid^="turn-hud-"]')).toBeVisible();
    } else {
      await expect(gate.or(loading).first()).toBeVisible();
    }
  });

  test('chat page offers ensure-session start', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByTestId('chat-page')).toBeVisible();

    const shell = page.getByTestId('chat-shell');
    const gate = page.getByRole('region', { name: '未开始' });
    const loading = page.getByText('正在接通会话…');
    const error = page.getByRole('alert', { name: '出错了' });

    await expect(shell.or(gate).or(loading).or(error).first()).toBeVisible();
  });
});
