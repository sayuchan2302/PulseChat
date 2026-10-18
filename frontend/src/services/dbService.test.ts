import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatRoom, Message, User } from '../types';
import type { SendMessagePayload } from '../types/chat.types';
import { DBService, type OfflinePendingMessage } from './dbService';

const CACHE_KEY = 'chat:1';

let nextUserId = 1;
let userId: number;
let service: DBService;

function message(id: number, timestamp: string, content: string): Message {
  return { id, timestamp, content, type: 'TEXT' } as unknown as Message;
}

function pending(id: string): OfflinePendingMessage {
  return { id, destination: '/app/chat.send', body: {} as SendMessagePayload, timestamp: 1 };
}

beforeEach(() => {
  userId = nextUserId++;
  service = new DBService();
  service.setActiveUser(userId);
});

describe('DBService', () => {
  it('round-trips the conversations cache for the active user', async () => {
    const rooms = [{ id: 1, name: 'Room', type: 'GROUP' }] as unknown as ChatRoom[];
    const users = [{ id: 2, username: 'bob', online: true }] as unknown as User[];

    await service.saveConversationsCache(userId, 'all', { rooms, users });
    const cached = await service.getConversationsCache(userId, 'all');

    expect(cached?.rooms).toEqual(rooms);
    expect(cached?.users).toEqual(users);
  });

  it('never serves cached data to another active user', async () => {
    await service.saveConversationsCache(userId, 'all', { rooms: [], users: [] });

    const other = new DBService();
    other.setActiveUser(userId + 100_000);

    expect(await other.getConversationsCache(userId, 'all')).toBeNull();
    expect(await other.getMessagesCache(userId, CACHE_KEY)).toEqual([]);
    expect(await other.getPendingQueue(userId)).toEqual([]);
  });

  it('replaces only the authoritative id window when refreshing a conversation', async () => {
    await service.saveMessagesCache(userId, CACHE_KEY, [
      message(1, '2026-10-01T10:01:00', 'm1'),
      message(2, '2026-10-01T10:02:00', 'm2'),
      message(3, '2026-10-01T10:03:00', 'm3'),
      message(4, '2026-10-01T10:04:00', 'm4'),
      message(5, '2026-10-01T10:05:00', 'm5'),
    ]);

    await service.replaceMessagesCache(
      userId,
      CACHE_KEY,
      [message(3, '2026-10-01T10:03:30', 'new 3'), message(4, '2026-10-01T10:04:30', 'new 4')],
      3,
      4
    );

    const messages = await service.getMessagesCache(userId, CACHE_KEY);
    expect(messages.map((cached) => cached.content)).toEqual(['m1', 'm2', 'new 3', 'new 4', 'm5']);
  });

  it('round-trips queued offline sends and removes them after replay', async () => {
    expect(await service.enqueuePendingMessage(userId, pending('client-1'))).toBe(true);
    expect(await service.getPendingQueue(userId)).toHaveLength(1);

    await service.removePendingMessage(userId, 'client-1');

    expect(await service.getPendingQueue(userId)).toEqual([]);
  });

  it('removes a deleted message from every conversation cache', async () => {
    await service.saveMessagesCache(userId, CACHE_KEY, [message(7, '2026-10-01T10:07:00', 'bye')]);

    await service.removeMessageFromCaches(userId, 7);

    expect(await service.getMessagesCache(userId, CACHE_KEY)).toEqual([]);
  });

  it('clears every store of the user on logout', async () => {
    await service.saveConversationsCache(userId, 'all', { rooms: [], users: [] });
    await service.saveMessagesCache(userId, CACHE_KEY, [message(1, '2026-10-01T10:01:00', 'm1')]);
    await service.enqueuePendingMessage(userId, pending('client-2'));

    await service.clearUser(userId);
    service.setActiveUser(userId);

    expect(await service.getConversationsCache(userId, 'all')).toBeNull();
    expect(await service.getMessagesCache(userId, CACHE_KEY)).toEqual([]);
    expect(await service.getPendingQueue(userId)).toEqual([]);
  });
});
