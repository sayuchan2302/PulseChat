import type { Page } from '@playwright/test';
import {
  closeSessions,
  expect,
  openAs,
  openDirectConversation,
  openProfileFromHeader,
  test,
} from './fixtures';

async function stabilizeVisuals(page: Page) {
  await page.addStyleTag({
    content: `
      * { font-family: Arial, sans-serif !important; }
      .user-preview,
      .details-profile > span,
      .details-row strong,
      .user-profile-copy > span,
      .message-time,
      .conversation-time,
      .unread-badge,
      .message-date-divider {
        visibility: hidden !important;
      }
    `,
  });
}

test.describe('@visual regressions', () => {
  test.skip(Boolean(process.env.CI), 'Image baselines are platform-specific. Run this suite locally.');

  test('login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Chat App' })).toBeVisible();
    await stabilizeVisuals(page);
    await expect(page).toHaveScreenshot('login-page.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('direct conversation', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.visualAlice.username);

    try {
      await openDirectConversation(alice.page, seed.users.visualBob);
      await stabilizeVisuals(alice.page);
      await expect(alice.page.locator('.chat-page')).toHaveScreenshot('direct-conversation.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await closeSessions(alice);
    }
  });

  test('partner profile dialog', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.visualAlice.username);

    try {
      await openDirectConversation(alice.page, seed.users.visualBob);
      const dialog = await openProfileFromHeader(alice.page, seed.users.visualBob.fullName);
      await stabilizeVisuals(alice.page);
      await expect(dialog).toHaveScreenshot('partner-profile.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await closeSessions(alice);
    }
  });

  test('mobile conversation list', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.visualAlice.username, {
      viewport: { width: 390, height: 844 },
    });

    try {
      await stabilizeVisuals(alice.page);
      await expect(alice.page.locator('.chat-container')).toHaveScreenshot('mobile-chat-list.png', {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
      });
    } finally {
      await closeSessions(alice);
    }
  });
});
