import {
  closeSessions,
  expect,
  openAs,
  openDirectConversation,
  test,
  uniqueText,
} from './fixtures';

test.describe('direct messaging', () => {
  test('delivers a direct message to both users in real time', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);
    const bob = await openAs(browser, seed, seed.users.bob.username);

    try {
      await openDirectConversation(alice.page, seed.users.bob);
      await openDirectConversation(bob.page, seed.users.alice);

      const text = uniqueText(seed, 'realtime-hello');
      await alice.page.locator('textarea.message-input').fill(text);
      await alice.page.getByRole('button', { name: 'Send' }).click();

      await expect(alice.page.locator('.message.sent').filter({ hasText: text })).toBeVisible();
      await expect(bob.page.locator('.message.received').filter({ hasText: text })).toBeVisible({
        timeout: 15_000,
      });
      await expect(alice.page.locator('.message.sent.failed').filter({ hasText: text })).toHaveCount(0);
    } finally {
      await closeSessions(alice, bob);
    }
  });

  test('recovers realtime delivery after the browser goes offline', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);
    const bob = await openAs(browser, seed, seed.users.bob.username);

    try {
      await openDirectConversation(alice.page, seed.users.bob);
      await openDirectConversation(bob.page, seed.users.alice);

      await alice.context.setOffline(true);
      await expect(alice.page.locator('.profile-presence-dot.offline')).toBeVisible({
        timeout: 15_000,
      });

      const offlineMessage = uniqueText(seed, 'offline-from-bob');
      await bob.page.locator('textarea.message-input').fill(offlineMessage);
      await bob.page.getByRole('button', { name: 'Send' }).click();
      await expect(bob.page.locator('.message.sent').filter({ hasText: offlineMessage })).toBeVisible();

      await alice.context.setOffline(false);
      await expect(alice.page.locator('.profile-presence-dot.online')).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        alice.page.locator('.message.received').filter({ hasText: offlineMessage })
      ).toBeVisible({ timeout: 15_000 });

      const onlineMessage = uniqueText(seed, 'online-from-alice');
      await alice.page.locator('textarea.message-input').fill(onlineMessage);
      await alice.page.getByRole('button', { name: 'Send' }).click();
      await expect(
        bob.page.locator('.message.received').filter({ hasText: onlineMessage })
      ).toBeVisible({ timeout: 15_000 });

      const liveMessage = uniqueText(seed, 'after-reconnect-from-bob');
      await bob.page.locator('textarea.message-input').fill(liveMessage);
      await bob.page.getByRole('button', { name: 'Send' }).click();
      await expect(
        alice.page.locator('.message.received').filter({ hasText: liveMessage })
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await closeSessions(alice, bob);
    }
  });

  test('reacts to a message and edits it through the action menu', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);

    try {
      await openDirectConversation(alice.page, seed.users.bob);
      const text = uniqueText(seed, 'actions-hello');
      await alice.page.locator('textarea.message-input').fill(text);
      await alice.page.getByRole('button', { name: 'Send' }).click();

      const sentMessage = alice.page.locator('.message.sent').filter({ hasText: text }).last();
      await expect(sentMessage).toBeVisible();
      await sentMessage.hover();

      await sentMessage.getByRole('button', { name: 'React to message' }).click();
      const reactionDialog = alice.page.getByRole('dialog', { name: 'Reaction emojis' });
      await expect(reactionDialog).toBeVisible();
      await reactionDialog.getByRole('button').first().click();
      await expect(sentMessage.locator('.message-reactions')).toBeVisible();

      const moreOptions = sentMessage.getByRole('button', { name: 'More options' });
      await moreOptions.click();
      const menu = alice.page.getByRole('menu', { name: 'Message options' });
      await expect(menu).toBeVisible();
      await alice.page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(moreOptions).toBeFocused();

      await moreOptions.click();
      await alice.page.getByRole('menuitem', { name: 'Edit' }).click();
      const editDialog = alice.page.getByRole('dialog', { name: 'Edit message' });
      await expect(editDialog).toBeVisible();

      const editedText = `${text}-edited`;
      await editDialog.getByRole('textbox', { name: 'Message text' }).fill(editedText);
      await editDialog.getByRole('button', { name: 'Save' }).click();
      await expect(editDialog).toBeHidden();

      const editedMessage = alice.page.locator('.message.sent').filter({ hasText: editedText }).last();
      await expect(editedMessage).toBeVisible();
      await expect(editedMessage.getByText('Edited')).toBeVisible();
    } finally {
      await closeSessions(alice);
    }
  });
});
