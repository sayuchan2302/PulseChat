import {
  closeSessions,
  expect,
  openAs,
  openDirectConversation,
  openProfileFromHeader,
  test,
  uniqueText,
} from './fixtures';

test.describe('social actions', () => {
  test('unfriends a partner from the profile danger zone', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.unfriendAlice.username);

    try {
      await openDirectConversation(alice.page, seed.users.unfriendBob);
      const dialog = await openProfileFromHeader(alice.page, seed.users.unfriendBob.fullName);

      await expect(dialog.getByRole('button', { name: 'Unfriend', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Unfriend', exact: true }).click();

      await expect(dialog).toBeHidden();
      const refreshedDialog = await openProfileFromHeader(
        alice.page,
        seed.users.unfriendBob.fullName
      );
      await expect(refreshedDialog.getByRole('button', { name: 'Add friend', exact: true })).toBeVisible();
      await expect(
        refreshedDialog.getByRole('button', { name: 'Unfriend', exact: true })
      ).toHaveCount(0);

      await alice.page.getByRole('button', { name: 'Close user profile' }).click();
      await expect(refreshedDialog).toBeHidden();
      await expect(
        alice.page.locator('.conversation-trigger .user-name', {
          hasText: seed.users.unfriendBob.fullName,
        })
      ).toHaveCount(0);
    } finally {
      await closeSessions(alice);
    }
  });

  test('creates a group with two friends', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);
    const groupName = uniqueText(seed, 'E2E Group');

    try {
      await alice.page.getByRole('button', { name: 'Create group' }).click();
      const dialog = alice.page.getByRole('dialog', { name: 'New group' });
      await expect(dialog).toBeVisible();

      await dialog.getByLabel('Group name').fill(groupName);
      await dialog
        .locator('.group-member-option')
        .filter({ hasText: seed.users.bob.fullName })
        .getByRole('checkbox')
        .check();
      await dialog
        .locator('.group-member-option')
        .filter({ hasText: seed.users.carol.fullName })
        .getByRole('checkbox')
        .check();

      await dialog.getByRole('button', { name: 'Create group', exact: true }).click();

      await expect(dialog).toBeHidden();
      await expect(alice.page).toHaveURL(/\/chat\/g\//);
      await expect(alice.page.locator('.chat-area-header .user-name')).toHaveText(groupName);
      await expect(
        alice.page.locator('.room-item .user-name', { hasText: groupName })
      ).toBeVisible();
    } finally {
      await closeSessions(alice);
    }
  });
});
