import type { Page } from '@playwright/test';
import {
  closeSessions,
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  openAs,
  openDirectConversation,
  test,
} from './fixtures';

type Box = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type ActionButtonMetrics = Box & {
  backgroundColor: string;
  borderRadius: string;
  color: string;
  label: string | null;
  text: string;
  hasSpan: boolean;
};

async function stubMediaDevices(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => new MediaStream(),
    });
  });
}

async function readActionButtons(page: Page) {
  return page.locator('.call-card .call-actions .call-round-btn').evaluateAll((buttons) =>
    buttons.map((element): ActionButtonMetrics => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        color: style.color,
        label: element.getAttribute('aria-label'),
        text: element.textContent?.trim() ?? '',
        hasSpan: Boolean(element.querySelector('span')),
      };
    })
  );
}

test.describe('incoming call UI', () => {
  test('matches the caller popup controls on desktop and mobile', async ({ browser, seed }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);
    const bob = await openAs(browser, seed, seed.users.bob.username);

    try {
      await openDirectConversation(alice.page, seed.users.bob);
      await openDirectConversation(bob.page, seed.users.alice);
      await expect(alice.page.locator('.profile-presence-dot.online')).toBeVisible();
      await expect(bob.page.locator('.profile-presence-dot.online')).toBeVisible();

      await stubMediaDevices(bob.page);
      await bob.page
        .getByRole('button', { name: `Start audio call with ${seed.users.alice.fullName}` })
        .click();
      const startButton = bob.page.getByRole('button', { name: 'Start call' });
      await expect(startButton).toBeEnabled();
      await startButton.click();

      const callerDialog = bob.page.getByRole('dialog', { name: 'Active call' });
      const receiverDialog = alice.page.getByRole('dialog', { name: 'Active call' });
      await expect(callerDialog.locator('.call-card.outgoing.ringing')).toBeVisible();
      await expect(receiverDialog.locator('.call-card.incoming.ringing')).toBeVisible();
      await expect(receiverDialog.getByRole('button', { name: 'Accept call' })).toBeVisible();
      await expect(receiverDialog.getByRole('button', { name: 'Decline call' })).toBeVisible();
      await expectNoSeriousA11yViolations(alice.page, 'incoming call popup', {
        include: '.call-card',
      });

      const callerButtons = await readActionButtons(bob.page);
      const receiverButtons = await readActionButtons(alice.page);

      expect(callerButtons).toHaveLength(2);
      expect(receiverButtons).toHaveLength(2);
      for (let index = 0; index < receiverButtons.length; index += 1) {
        expect(receiverButtons[index].width).toBe(callerButtons[index].width);
        expect(receiverButtons[index].height).toBe(callerButtons[index].height);
        expect(receiverButtons[index].borderRadius).toBe(callerButtons[index].borderRadius);
      }
      expect(receiverButtons.map((button) => button.label)).toEqual([
        'Accept call',
        'Decline call',
      ]);
      expect(receiverButtons.map((button) => button.text)).toEqual(['', '']);
      expect(receiverButtons.map((button) => button.hasSpan)).toEqual([false, false]);
      expect(receiverButtons[0].backgroundColor).toBe('rgb(21, 128, 61)');
      expect(receiverButtons[1].backgroundColor).toBe('rgb(255, 59, 48)');

      const readCardMetrics = (page: Page) =>
        page.locator('.call-card').evaluate((card) => {
          const box = (element: Element): Box => {
            const rect = element.getBoundingClientRect();
            return {
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            };
          };
          return {
            card: box(card),
            name: box(card.querySelector('.call-identity strong')!),
            status: box(card.querySelector('.call-status-row')!),
          };
        });

      const assertCardFits = async (viewport: { width: number; height: number }) => {
        const metrics = await readCardMetrics(alice.page);
        expect(metrics.name.bottom).toBeLessThanOrEqual(metrics.status.top + 1);
        expect(metrics.card.left).toBeGreaterThanOrEqual(0);
        expect(metrics.card.right).toBeLessThanOrEqual(viewport.width);
        expect(metrics.card.top).toBeGreaterThanOrEqual(0);
        expect(metrics.card.bottom).toBeLessThanOrEqual(viewport.height);
      };

      await assertCardFits({ width: 1440, height: 900 });

      await alice.page.setViewportSize({ width: 390, height: 844 });
      await expect(receiverDialog).toBeVisible();
      await assertCardFits({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(alice.page);

      await receiverDialog.getByRole('button', { name: 'Decline call' }).click();
      await expect(receiverDialog).toBeHidden();
    } finally {
      await closeSessions(alice, bob);
    }
  });
});
