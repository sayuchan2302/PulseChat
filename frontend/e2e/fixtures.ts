import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  request,
  test as base,
  type Browser,
  type BrowserContext,
  type Page,
  type ViewportSize,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type SeedUser = {
  id: number;
  username: string;
  fullName: string;
};

export type SeedData = {
  runId: string;
  password: string;
  apiBaseUrl: string;
  appBaseUrl: string;
  users: Record<string, SeedUser>;
};

export type Session = {
  context: BrowserContext;
  page: Page;
};

export const test = base.extend<{ seed: SeedData }>({
  // Playwright requires an object destructuring pattern for fixture dependencies.
  // oxlint-disable-next-line no-empty-pattern
  seed: async ({}, provide) => {
    const seedPath = path.resolve(process.cwd(), 'e2e/.auth/users.json');
    await provide(JSON.parse(readFileSync(seedPath, 'utf8')) as SeedData);
  },
});

export { expect };

function ensureSeed(seed: SeedData) {
  if (!seed.users.alice || !seed.users.bob) {
    throw new Error('E2E seed data is incomplete. Run the setup project first.');
  }
  return seed;
}

export async function openAs(
  browser: Browser,
  seed: SeedData,
  username: string,
  options: { viewport?: ViewportSize } = {}
): Promise<Session> {
  ensureSeed(seed);
  const api = await request.newContext({ baseURL: seed.apiBaseUrl });
  const login = await api.post('auth/login', {
    data: { username, password: seed.password },
  });

  if (!login.ok()) {
    throw new Error(`Failed to log in ${username}: ${login.status()} ${await login.text()}`);
  }

  const storageState = await api.storageState();
  await api.dispose();

  const context = await browser.newContext({
    baseURL: seed.appBaseUrl,
    storageState,
    viewport: options.viewport ?? { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('/chat');
  await expect(page.locator('.chat-page')).toBeVisible();
  await expect(page.getByLabel('Chat list')).toBeVisible();

  return { context, page };
}

export async function closeSessions(...sessions: Session[]) {
  await Promise.all(sessions.map((session) => session.context.close()));
}

export function uniqueText(seed: SeedData, prefix: string) {
  return `${prefix}-${seed.runId}-${Date.now().toString(36)}`;
}

export async function openDirectConversation(page: Page, partner: SeedUser) {
  await page.goto(`/chat/u/${encodeURIComponent(partner.username)}`);
  await expect(page.locator('textarea.message-input')).toHaveAttribute(
    'placeholder',
    `Message ${partner.fullName}`
  );
}

export async function openProfileFromHeader(page: Page, displayName: string) {
  await page
    .locator('.chat-area-header')
    .getByRole('button', { name: `View profile of ${displayName}` })
    .click();
  const dialog = page.locator('.user-profile-modal');
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    dimensions.scrollWidth,
    `page should not overflow horizontally (scrollWidth=${dimensions.scrollWidth}, clientWidth=${dimensions.clientWidth})`
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function expectNoSeriousA11yViolations(
  page: Page,
  label: string,
  options: { include?: string } = {}
) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  if (options.include) builder = builder.include(options.include);
  const results = await builder.analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  );

  expect(
    serious,
    `${label} has serious accessibility violations:\n${JSON.stringify(
      serious.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target),
      })),
      null,
      2
    )}`
  ).toEqual([]);
}
