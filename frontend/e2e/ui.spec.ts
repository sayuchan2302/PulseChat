import {
  closeSessions,
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  openAs,
  openDirectConversation,
  openProfileFromHeader,
  test,
} from './fixtures';

test.describe('modals and responsive layout', () => {
  test('closes account modals with Escape', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);

    try {
      const profileMenu = alice.page.getByRole('button', { name: /Profile menu for/ });

      await profileMenu.click();
      await alice.page.getByRole('menuitem', { name: 'Edit profile' }).click();
      const editor = alice.page.getByRole('dialog', { name: 'Edit profile' });
      await expect(editor).toBeVisible();
      await alice.page.keyboard.press('Escape');
      await expect(editor).toBeHidden();

      await profileMenu.click();
      await alice.page.getByRole('menuitem', { name: 'Blocked users' }).click();
      const blocked = alice.page.getByRole('dialog', { name: 'Blocked users' });
      await expect(blocked).toBeVisible();
      await alice.page.keyboard.press('Escape');
      await expect(blocked).toBeHidden();

      await alice.page.getByRole('button', { name: 'Create group' }).click();
      const createGroup = alice.page.getByRole('dialog', { name: 'New group' });
      await expect(createGroup).toBeVisible();
      await alice.page.keyboard.press('Escape');
      await expect(createGroup).toBeHidden();
    } finally {
      await closeSessions(alice);
    }
  });

  test('closes the partner profile from the backdrop', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);

    try {
      await openDirectConversation(alice.page, seed.users.bob);
      const dialog = await openProfileFromHeader(alice.page, seed.users.bob.fullName);
      await expect(dialog).toBeVisible();

      await alice.page.locator('.modal-backdrop').click({ position: { x: 8, y: 8 } });
      await expect(dialog).toBeHidden();
    } finally {
      await closeSessions(alice);
    }
  });

  test('keeps the mobile layout usable without horizontal overflow', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.visualAlice.username, {
      viewport: { width: 390, height: 844 },
    });

    try {
      await expectNoHorizontalOverflow(alice.page);
      await expect(alice.page.locator('.sidebar')).toBeVisible();

      await openDirectConversation(alice.page, seed.users.visualBob);
      await expect(alice.page.locator('.chat-container')).toHaveClass(/conversation-open/);
      await expect(alice.page.getByRole('button', { name: 'Back to chat list' })).toBeVisible();
      await expect(alice.page.locator('textarea.message-input')).toBeVisible();
      await expectNoHorizontalOverflow(alice.page);

      await alice.page.getByRole('button', { name: 'Show conversation details' }).click();
      const details = alice.page.getByRole('complementary', { name: 'Conversation details' });
      await expect(details).toBeVisible();
      await expectNoHorizontalOverflow(alice.page);
      await details.getByRole('button', { name: 'Close conversation details' }).click();
      await expect(details).toBeHidden();

      await alice.page.getByRole('button', { name: 'Back to chat list' }).click();
      await expect(alice.page.locator('.sidebar')).toBeVisible();
      await expect(alice.page.getByLabel('Chat list')).toBeVisible();
    } finally {
      await closeSessions(alice);
    }
  });

  test('keeps critical component styles applied', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.visualAlice.username);

    try {
      await openDirectConversation(alice.page, seed.users.visualBob);

      const styles = await alice.page.evaluate(() => {
        const read = (selector: string, properties: string[]) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const computed = getComputedStyle(element);
          return Object.fromEntries(
            properties.map((property) => [property, computed.getPropertyValue(property)])
          );
        };

        return {
          sidebar: read('.sidebar', ['display', 'width', 'background-color']),
          conversation: read('.conversation-trigger', ['display', 'width', 'height']),
          composer: read('.message-composer', ['display', 'background-color', 'border-radius']),
          input: read('.message-input', ['display', 'min-height']),
          sendButton: read('.send-btn', ['display', 'background-color', 'color', 'border-radius', 'padding']),
          details: read('.details-sidebar', ['display', 'width', 'background-color']),
        };
      });

      expect(styles.sidebar).not.toBeNull();
      expect(styles.sidebar?.display).not.toBe('none');
      expect(Number.parseFloat(styles.sidebar?.width ?? '0')).toBeGreaterThan(240);
      expect(styles.sidebar?.['background-color']).not.toBe('rgba(0, 0, 0, 0)');

      expect(styles.conversation?.display).toBe('flex');
      expect(Number.parseFloat(styles.conversation?.height ?? '0')).toBeGreaterThan(40);

      expect(styles.composer?.display).toBe('flex');
      expect(styles.composer?.['background-color']).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.composer?.['border-radius']).not.toBe('0px');
      expect(styles.input?.display).not.toBe('none');
      expect(Number.parseFloat(styles.input?.['min-height'] ?? '0')).toBeGreaterThan(20);

      expect(styles.sendButton?.display).not.toBe('none');
      expect(styles.sendButton?.['background-color']).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.sendButton?.color).not.toBe('rgba(0, 0, 0, 0)');
      expect(styles.sendButton?.['border-radius']).not.toBe('0px');

      expect(styles.details?.display).not.toBe('none');
      expect(Number.parseFloat(styles.details?.width ?? '0')).toBeGreaterThan(240);

      const dialog = await openProfileFromHeader(alice.page, seed.users.visualBob.fullName);
      const modalStyles = await alice.page.evaluate(() => {
        const modal = document.querySelector('.user-profile-modal');
        const backdrop = document.querySelector('.modal-backdrop');
        if (!modal || !backdrop) return null;
        const modalComputed = getComputedStyle(modal);
        const backdropComputed = getComputedStyle(backdrop);
        return {
          modalBackground: modalComputed.backgroundColor,
          modalRadius: modalComputed.borderRadius,
          modalWidth: modalComputed.width,
          backdropPosition: backdropComputed.position,
          backdropBackground: backdropComputed.backgroundColor,
        };
      });

      expect(modalStyles).not.toBeNull();
      expect(modalStyles?.modalBackground).not.toBe('rgba(0, 0, 0, 0)');
      expect(modalStyles?.modalRadius).not.toBe('0px');
      expect(Number.parseFloat(modalStyles?.modalWidth ?? '0')).toBeGreaterThan(280);
      expect(modalStyles?.backdropPosition).toBe('fixed');
      expect(modalStyles?.backdropBackground).not.toBe('rgba(0, 0, 0, 0)');

      await dialog.getByRole('button', { name: 'Close user profile' }).click();
    } finally {
      await closeSessions(alice);
    }
  });
});

test.describe('accessibility smoke', () => {
  test('login and chat surfaces have no serious axe violations', async ({ browser, page, seed }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Chat App' })).toBeVisible();
    await expectNoSeriousA11yViolations(page, 'Login page');

    const alice = await openAs(browser, seed, seed.users.visualAlice.username);
    try {
      await expectNoSeriousA11yViolations(alice.page, 'Chat page');

      await openDirectConversation(alice.page, seed.users.visualBob);
      await expectNoSeriousA11yViolations(alice.page, 'Conversation view');

      const dialog = await openProfileFromHeader(alice.page, seed.users.visualBob.fullName);
      await expectNoSeriousA11yViolations(alice.page, 'User profile dialog');
      await dialog.getByRole('button', { name: 'Close user profile' }).click();
    } finally {
      await closeSessions(alice);
    }
  });
});
