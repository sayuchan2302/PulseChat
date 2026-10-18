import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus } from '../types';
import { WebSocketService } from './websocket';

const stomp = vi.hoisted(() => {
  type MessageCallback = (message: { body: string }) => void;

  class FakeClient {
    static instances: FakeClient[] = [];
    active = false;
    connectHeaders: Record<string, string> = {};
    reconnectDelay = 0;
    published: Array<{ destination: string; body: string }> = [];
    subscriptions: Array<{ destination: string; callback: MessageCallback }> = [];
    config: Record<string, unknown>;
    onConnect: (() => void) | null = null;
    onStompError: ((frame: { headers: Record<string, string>; body: string }) => void) | null = null;
    onWebSocketError: (() => void) | null = null;
    onWebSocketClose: (() => void) | null = null;

    constructor(config: Record<string, unknown>) {
      this.config = config;
      FakeClient.instances.push(this);
    }

    activate() {
      this.active = true;
    }

    async deactivate() {
      this.active = false;
    }

    subscribe(destination: string, callback: MessageCallback) {
      this.subscriptions.push({ destination, callback });
      return { unsubscribe: vi.fn() };
    }

    publish(message: { destination: string; body: string }) {
      this.published.push(message);
    }
  }

  return { FakeClient };
});

vi.mock('@stomp/stompjs', () => ({ Client: stomp.FakeClient }));
vi.mock('sockjs-client', () => ({ default: vi.fn() }));

const api = vi.hoisted(() => ({ getValidAccessToken: vi.fn() }));

vi.mock('./api', () => ({ getValidAccessToken: api.getValidAccessToken }));

async function connectService(
  service: WebSocketService,
  onStatus?: (status: ConnectionStatus) => void
) {
  const onMessage = vi.fn();
  const connecting = service.connect(onMessage, undefined, undefined, undefined, onStatus);
  await vi.waitFor(() => expect(stomp.FakeClient.instances).toHaveLength(1));
  const client = stomp.FakeClient.instances[0];
  if (!client) {
    throw new Error('STOMP client was not created');
  }
  client.onConnect?.();
  await connecting;
  return { client, onMessage };
}

beforeEach(() => {
  stomp.FakeClient.instances.length = 0;
});

describe('WebSocketService', () => {
  it('subscribes to every user queue once the broker connection opens', async () => {
    api.getValidAccessToken.mockResolvedValue('jwt-1');
    const service = new WebSocketService();
    const statuses: ConnectionStatus[] = [];
    const { client, onMessage } = await connectService(service, (status) => statuses.push(status));

    expect(client.subscriptions.map((subscription) => subscription.destination)).toEqual([
      '/user/queue/messages',
      '/user/queue/message-updates',
      '/user/queue/message-hides',
      '/user/queue/presence',
      '/user/queue/typing',
      '/user/queue/read-receipts',
      '/user/queue/room-read-receipts',
      '/user/queue/rooms',
      '/user/queue/friend-requests',
      '/user/queue/calls',
      '/user/queue/errors',
    ]);
    expect(service.isConnected()).toBe(true);
    expect(statuses.at(-1)).toBe('connected');

    const messagesSubscription = client.subscriptions.find(
      (subscription) => subscription.destination === '/user/queue/messages'
    );
    messagesSubscription?.callback({ body: JSON.stringify({ id: 3, content: 'hi' }) });
    expect(onMessage).toHaveBeenCalledWith({ id: 3, content: 'hi' });
  });

  it('re-reads the access token before each (re)connect attempt', async () => {
    api.getValidAccessToken.mockResolvedValue('jwt-1');
    const service = new WebSocketService();
    const { client } = await connectService(service);

    api.getValidAccessToken.mockResolvedValue('jwt-2');
    const beforeConnect = client.config.beforeConnect as () => Promise<void>;
    await beforeConnect();

    expect(client.connectHeaders).toEqual({ Authorization: 'Bearer jwt-2' });
  });

  it('publishes frames only while connected and deactivates on disconnect', async () => {
    api.getValidAccessToken.mockResolvedValue('jwt-1');
    const service = new WebSocketService();
    const { client } = await connectService(service);

    expect(service.sendMessage('/app/chat.send', { content: 'hello' })).toBe(true);
    expect(client.published).toEqual([
      { destination: '/app/chat.send', body: JSON.stringify({ content: 'hello' }) },
    ]);

    service.disconnect();

    expect(client.active).toBe(false);
    expect(service.isConnected()).toBe(false);
    expect(service.getConnectionStatus()).toBe('offline');
    expect(service.sendMessage('/app/chat.send', { content: 'later' })).toBe(false);
  });

  it('reports reconnecting when the socket drops without a manual disconnect', async () => {
    api.getValidAccessToken.mockResolvedValue('jwt-1');
    const service = new WebSocketService();
    const statuses: ConnectionStatus[] = [];
    const { client } = await connectService(service, (status) => statuses.push(status));

    client.onWebSocketClose?.();

    expect(service.isConnected()).toBe(false);
    expect(statuses.at(-1)).toBe('reconnecting');
    expect(client.reconnectDelay).toBeGreaterThan(0);
  });

  it('rejects the connection attempt when no access token is available', async () => {
    api.getValidAccessToken.mockResolvedValue(null);
    const service = new WebSocketService();

    await expect(service.connect(vi.fn())).rejects.toThrow('Missing auth token');
    expect(service.getConnectionStatus()).toBe('offline');
  });
});
