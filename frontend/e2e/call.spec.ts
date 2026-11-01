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

// Return live tracks without physical devices so E2E can exercise the real call UI.
async function stubMediaDevices(page: Page) {
  await page.evaluate(() => {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error('AudioContext is unavailable');
    }

    const context = new AudioContextConstructor();
    void context.resume().catch(() => undefined);
    (window as unknown as { __callTestAudioContext?: AudioContext }).__callTestAudioContext =
      context;

    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async (constraints?: MediaStreamConstraints) => {
        const stream = new MediaStream();
        if (constraints?.audio) {
          const destination = context.createMediaStreamDestination();
          const oscillator = context.createOscillator();
          oscillator.connect(destination);
          oscillator.start();
          stream.addTrack(destination.stream.getAudioTracks()[0]);
        }
        if (constraints?.video) {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const context2d = canvas.getContext('2d');
          if (context2d) {
            context2d.fillStyle = '#4c1d95';
            context2d.fillRect(0, 0, canvas.width, canvas.height);
            context2d.fillStyle = '#f5f3ff';
            context2d.font = '48px sans-serif';
            context2d.fillText('E2E camera', 180, 195);
          }
          const videoStream = canvas.captureStream(10);
          const videoTrack = videoStream.getVideoTracks()[0];
          if (videoTrack) {
            stream.addTrack(videoTrack);
          }
        }
        return stream;
      },
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
  test('matches caller controls and expands the audio call on desktop and mobile', async ({
    browser,
    seed,
  }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);
    const bob = await openAs(browser, seed, seed.users.bob.username);

    try {
      await openDirectConversation(alice.page, seed.users.bob);
      await openDirectConversation(bob.page, seed.users.alice);
      await expect(alice.page.locator('.profile-presence-dot.online')).toBeVisible();
      await expect(bob.page.locator('.profile-presence-dot.online')).toBeVisible();

      await stubMediaDevices(alice.page);
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

      await alice.page.setViewportSize({ width: 1440, height: 900 });
      await expect(receiverDialog.getByRole('button', { name: 'Accept call' })).toBeVisible();
      await receiverDialog.getByRole('button', { name: 'Accept call' }).click();
      await expect(receiverDialog).toHaveClass(/expanded/);
      await expect(receiverDialog.locator('.call-card')).toHaveClass(/connecting|connected/);

      const expandedMetrics = await readCardMetrics(alice.page);
      expect(expandedMetrics.card.width).toBeGreaterThanOrEqual(760);
      expect(expandedMetrics.card.width).toBeLessThanOrEqual(900);
      expect(expandedMetrics.card.left).toBeGreaterThanOrEqual(0);
      expect(expandedMetrics.card.right).toBeLessThanOrEqual(1440);
      expect(expandedMetrics.card.top).toBeGreaterThanOrEqual(0);
      expect(expandedMetrics.card.bottom).toBeLessThanOrEqual(900);

      const audioStageHeight = await receiverDialog
        .locator('.call-audio-stage')
        .evaluate((stage) => stage.getBoundingClientRect().height);
      expect(audioStageHeight).toBeGreaterThanOrEqual(240);

      const expandedButtons = await readActionButtons(alice.page);
      expect(expandedButtons.length).toBeGreaterThanOrEqual(2);
      await expect
        .poll(async () => {
          const buttons = await readActionButtons(alice.page);
          return buttons.every(
            (button) =>
              Math.abs(button.width - 46) < 0.5 && Math.abs(button.height - 46) < 0.5
          );
        })
        .toBe(true);
      await expectNoSeriousA11yViolations(alice.page, 'expanded audio call popup', {
        include: '.call-card',
      });

      await receiverDialog.getByRole('button', { name: 'Minimize active call' }).click();
      const minimizedCall = alice.page.getByRole('region', { name: 'Minimized active call' });
      await expect(minimizedCall).toBeVisible();
      await expect(alice.page.locator('.call-overlay.minimized')).toBeVisible();
      await minimizedCall.getByRole('button', { name: /Restore call with/ }).click();
      await expect(receiverDialog).toHaveClass(/expanded/);
      await expect(receiverDialog.locator('.call-card')).toBeVisible();

      await alice.page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(async () => (await readCardMetrics(alice.page)).card.width)
        .toBeGreaterThanOrEqual(389);
      const mobileExpandedMetrics = await readCardMetrics(alice.page);
      expect(mobileExpandedMetrics.card.top).toBe(0);
      expect(mobileExpandedMetrics.card.left).toBe(0);
      expect(mobileExpandedMetrics.card.height).toBeGreaterThanOrEqual(840);
      await expectNoHorizontalOverflow(alice.page);

      await receiverDialog.getByRole('button', { name: 'End call' }).click();
      await expect(receiverDialog).toBeHidden();
    } finally {
      await closeSessions(alice, bob);
    }
  });

  test('expands the video call into a large stage with a floating self-view', async ({
    browser,
    seed,
  }) => {
    const alice = await openAs(browser, seed, seed.users.alice.username);
    const bob = await openAs(browser, seed, seed.users.bob.username);

    try {
      await openDirectConversation(alice.page, seed.users.bob);
      await openDirectConversation(bob.page, seed.users.alice);
      await expect(alice.page.locator('.profile-presence-dot.online')).toBeVisible();
      await expect(bob.page.locator('.profile-presence-dot.online')).toBeVisible();

      await stubMediaDevices(alice.page);
      await stubMediaDevices(bob.page);
      await bob.page
        .getByRole('button', { name: `Start video call with ${seed.users.alice.fullName}` })
        .click();
      const startButton = bob.page.getByRole('button', { name: 'Start call' });
      await expect(startButton).toBeEnabled();
      await startButton.click();

      const receiverDialog = alice.page.getByRole('dialog', { name: 'Active call' });
      await expect(receiverDialog.locator('.call-card.incoming.ringing')).toBeVisible();
      await receiverDialog.getByRole('button', { name: 'Accept call' }).click();
      await expect(receiverDialog).toHaveClass(/expanded/);

      const videoStage = receiverDialog.locator('.call-video-stage');
      await expect(videoStage).toBeVisible();
      const stageMetrics = await videoStage.evaluate((stage) => {
        const rect = stage.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      });
      expect(stageMetrics.width).toBeGreaterThanOrEqual(700);
      expect(stageMetrics.height).toBeGreaterThanOrEqual(240);
      await expectNoSeriousA11yViolations(alice.page, 'expanded video call popup', {
        include: '.call-card',
      });

      const localVideo = receiverDialog.locator('.call-local-video');
      await expect(localVideo).toBeVisible();
      await expect
        .poll(async () => (await localVideo.boundingBox())?.width ?? 0)
        .toBeGreaterThanOrEqual(170);
      const localVideoBox = await localVideo.boundingBox();
      expect(localVideoBox).not.toBeNull();
      expect(localVideoBox!.x + localVideoBox!.width).toBeLessThanOrEqual(
        stageMetrics.right + 1
      );
      expect(localVideoBox!.y + localVideoBox!.height).toBeLessThanOrEqual(
        stageMetrics.bottom + 1
      );

      await alice.page.setViewportSize({ width: 390, height: 844 });
      await expect
        .poll(async () => (await videoStage.boundingBox())?.width ?? 0)
        .toBeGreaterThanOrEqual(360);

      await receiverDialog.getByRole('button', { name: 'End call' }).click();
      await expect(receiverDialog).toBeHidden();
    } finally {
      await closeSessions(alice, bob);
    }
  });
});
