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

type ButtonMetrics = Box & {
  backgroundColor: string;
  color: string;
  clientWidth: number;
  scrollWidth: number;
};

async function stubMediaDevices(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => new MediaStream(),
    });
  });
}

test.describe('incoming call UI', () => {
  test('keeps the receiver popup readable on desktop and mobile', async ({ browser, seed }) => {
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

      const dialog = alice.page.getByRole('dialog', { name: 'Active call' });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.call-card.incoming.ringing')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Accept' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Decline' })).toBeVisible();
      await expectNoSeriousA11yViolations(alice.page, 'incoming call popup', {
        include: '.call-card',
      });

      const readMetrics = () =>
        dialog.evaluate((card) => {
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
          const button = (selector: string): ButtonMetrics => {
            const element = card.querySelector<HTMLButtonElement>(selector);
            if (!element) throw new Error(`Missing call button: ${selector}`);
            const style = getComputedStyle(element);
            return {
              ...box(element),
              backgroundColor: style.backgroundColor,
              color: style.color,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
            };
          };

          return {
            card: box(card),
            name: box(card.querySelector('.call-identity strong')!),
            status: box(card.querySelector('.call-status-row')!),
            accept: button('.call-action-btn.accept'),
            decline: button('.call-action-btn.end'),
          };
        });

      const assertReadable = (metrics: Awaited<ReturnType<typeof readMetrics>>, viewport: { width: number; height: number }) => {
        expect(metrics.accept.width).toBeGreaterThanOrEqual(110);
        expect(metrics.decline.width).toBeGreaterThanOrEqual(110);
        expect(metrics.accept.height).toBeGreaterThanOrEqual(40);
        expect(metrics.decline.height).toBeGreaterThanOrEqual(40);
        expect(metrics.accept.scrollWidth).toBeLessThanOrEqual(metrics.accept.clientWidth + 1);
        expect(metrics.decline.scrollWidth).toBeLessThanOrEqual(metrics.decline.clientWidth + 1);
        expect(metrics.name.bottom).toBeLessThanOrEqual(metrics.status.top + 1);
        expect(metrics.decline.backgroundColor).toBe('rgb(254, 242, 242)');
        expect(metrics.decline.color).toBe('rgb(185, 28, 28)');
        expect(metrics.card.left).toBeGreaterThanOrEqual(0);
        expect(metrics.card.right).toBeLessThanOrEqual(viewport.width);
        expect(metrics.card.top).toBeGreaterThanOrEqual(0);
        expect(metrics.card.bottom).toBeLessThanOrEqual(viewport.height);
      };

      assertReadable(await readMetrics(), { width: 1440, height: 900 });

      await alice.page.setViewportSize({ width: 390, height: 844 });
      await expect(dialog).toBeVisible();
      assertReadable(await readMetrics(), { width: 390, height: 844 });
      await expectNoHorizontalOverflow(alice.page);

      await dialog.getByRole('button', { name: 'Decline' }).click();
      await expect(dialog).toBeHidden();
    } finally {
      await closeSessions(alice, bob);
    }
  });
});
