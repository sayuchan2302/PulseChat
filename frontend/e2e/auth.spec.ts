import { expect, test } from './fixtures';

test.describe('authentication', () => {
  test('registers a new account through the UI', async ({ page, seed }) => {
    const username = `e2e_signup_${seed.runId}_${Date.now().toString(36)}`;

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Chat App' })).toBeVisible();

    await page.getByRole('button', { name: 'Register' }).click();
    await page.getByLabel('Full name').fill('E2E Signup');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(`${username}@example.com`);
    await page.getByLabel('Password').fill(seed.password);
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('.chat-page')).toBeVisible();
    await expect(page.getByText('No conversations yet.')).toBeVisible();
  });

  test('logs in, keeps the session on reload, and logs out', async ({ page, seed }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill(seed.users.alice.username);
    await page.getByLabel('Password').fill(seed.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('.chat-page')).toBeVisible();

    await page.reload();
    await expect(page.locator('.chat-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chat App' })).toBeVisible();

    await page.getByRole('button', { name: /Profile menu for/ }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('shows an error for invalid credentials', async ({ page, seed }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill(seed.users.alice.username);
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
