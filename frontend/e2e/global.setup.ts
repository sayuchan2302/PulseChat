import { expect, request, test as setup } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiPort = process.env.E2E_API_PORT ?? '8081';
const appPort = process.env.E2E_APP_PORT ?? '4173';
const apiBaseUrl = `http://localhost:${apiPort}/api/`;
const appBaseUrl = `http://localhost:${appPort}`;
const password = 'E2ePass123!';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type SeedUser = {
  id: number;
  username: string;
  fullName: string;
};

type SeedData = {
  runId: string;
  password: string;
  apiBaseUrl: string;
  appBaseUrl: string;
  users: Record<string, SeedUser>;
};

async function register(
  api: Awaited<ReturnType<typeof request.newContext>>,
  key: string,
  fullName: string
) {
  const username = `e2e_${key}_${runId}`;
  const response = await api.post('auth/register', {
    data: {
      fullName,
      username,
      email: `${username}@example.com`,
      password,
    },
  });

  if (response.status() !== 201) {
    throw new Error(`Failed to register ${username}: ${response.status()} ${await response.text()}`);
  }

  const body = (await response.json()) as { user: SeedUser; token: string };
  return {
    user: { id: body.user.id, username: body.user.username, fullName: body.user.fullName },
    token: body.token,
  };
}

async function makeFriends(
  api: Awaited<ReturnType<typeof request.newContext>>,
  requesterToken: string,
  receiverToken: string,
  receiverId: number
) {
  const requestResponse = await api.post('friend-requests', {
    headers: { Authorization: `Bearer ${requesterToken}` },
    data: { receiverId },
  });
  const requestBody = await requestResponse.text();
  expect(requestResponse.status(), requestBody).toBe(201);
  const friendship = JSON.parse(requestBody) as { id: number };

  const acceptResponse = await api.patch(`friend-requests/${friendship.id}/accept`, {
    headers: { Authorization: `Bearer ${receiverToken}` },
  });
  const acceptBody = await acceptResponse.text();
  expect(acceptResponse.status(), acceptBody).toBe(200);
}

async function seedMessage(
  api: Awaited<ReturnType<typeof request.newContext>>,
  senderToken: string,
  recipientId: number,
  content: string,
  clientId: string
) {
  const response = await api.post('messages', {
    headers: { Authorization: `Bearer ${senderToken}` },
    data: { receiverId: recipientId, content, clientId },
  });
  const body = await response.text();
  expect(response.status(), body).toBe(201);
}

async function markRead(
  api: Awaited<ReturnType<typeof request.newContext>>,
  readerToken: string,
  partnerId: number
) {
  const response = await api.patch(`messages/${partnerId}/read`, {
    headers: { Authorization: `Bearer ${readerToken}` },
  });
  const body = await response.text();
  expect(response.status(), body).toBe(200);
}

setup('seed browser E2E accounts', async () => {
  const api = await request.newContext({ baseURL: apiBaseUrl });

  const alice = await register(api, 'alice', 'E2E Alice');
  const bob = await register(api, 'bob', 'E2E Bob');
  const carol = await register(api, 'carol', 'E2E Carol');
  const visualAlice = await register(api, 'visual_alice', 'Visual Alice');
  const visualBob = await register(api, 'visual_bob', 'Visual Bob');
  const unfriendAlice = await register(api, 'unfriend_alice', 'Unfriend Alice');
  const unfriendBob = await register(api, 'unfriend_bob', 'Unfriend Bob');

  await makeFriends(api, alice.token, bob.token, bob.user.id);
  await makeFriends(api, alice.token, carol.token, carol.user.id);
  await makeFriends(api, visualAlice.token, visualBob.token, visualBob.user.id);
  await makeFriends(api, unfriendAlice.token, unfriendBob.token, unfriendBob.user.id);

  // A private conversation only appears in the sidebar after its first message.
  await seedMessage(api, bob.token, alice.user.id, 'Seed message from Bob', `seed-bob-${runId}`);
  await markRead(api, alice.token, bob.user.id);
  await seedMessage(
    api,
    visualBob.token,
    visualAlice.user.id,
    'Visual seed message',
    `seed-visual-${runId}`
  );
  await markRead(api, visualAlice.token, visualBob.user.id);

  const data: SeedData = {
    runId,
    password,
    apiBaseUrl,
    appBaseUrl,
    users: {
      alice: alice.user,
      bob: bob.user,
      carol: carol.user,
      visualAlice: visualAlice.user,
      visualBob: visualBob.user,
      unfriendAlice: unfriendAlice.user,
      unfriendBob: unfriendBob.user,
    },
  };

  const authDir = path.join(__dirname, '.auth');
  mkdirSync(authDir, { recursive: true });
  writeFileSync(path.join(authDir, 'users.json'), `${JSON.stringify(data, null, 2)}\n`);

  await api.dispose();
});
