import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import { wsService } from '../services/websocket';
import { dbService } from '../services/dbService';
import type { OfflinePendingMessage } from '../services/dbService';
import type { ChatRoom, Message, User, MediaAttachment } from '../types';
import type { ChatMessage, PendingMedia, SendMessagePayload, SendRoomMessagePayload } from '../types/chat.types';
import { appendOrReconcileMessage, applyMediaPayload, isActiveConversationMessage, markOptimisticMessageFailed } from '../utils/messageUtils';
import { applyConversationPreviewToUser, applyConversationPreviewToUsers,
  applyRoomPreviewToRoom, applyRoomPreviewToRooms } from '../utils/conversationUtils';

interface Options {
  uploadPendingMedia: (media: PendingMedia) => Promise<MediaAttachment>;
  currentUserId: number | undefined;
  selectedUserIdRef: MutableRefObject<number | null>;
  currentUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  userSearchQueryRef: MutableRefObject<string>;
  clearOptimisticSendTimeout: (clientId: string) => void;
  scheduleOptimisticSendTimeout: (clientId: string) => void;
  addIncomingSharedContent: (message: Message) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
}


export function useMessageTransport(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const inFlight = useRef(new Set<string>());
  const nextAttempt = useRef(new Map<string, number>());
  const attempts = useRef(new Map<string, number>());
  const lifetime = useRef(0);

  const deliver = useCallback(async (item: OfflinePendingMessage, websocket = false) => {
    const owner = latest.current.currentUserIdRef.current;
    const generation = lifetime.current;
    if (!owner || navigator.onLine === false || item.failed || inFlight.current.has(item.id)) return;
    const active = () => lifetime.current === generation && latest.current.currentUserIdRef.current === owner;
    inFlight.current.add(item.id);
    try {
      const o = latest.current;
      if (item.attachment && !item.body.media) {
        const media = await o.uploadPendingMedia(item.attachment);
        if (!active()) return;
        item = { ...item, attachment: undefined, body: { ...item.body, media },
          optimistic: item.optimistic ? applyMediaPayload(item.optimistic, media) : undefined };
        // Save the uploaded reference before sending, so an ACK loss never uploads again.
        if (!await dbService.enqueuePendingMessage(owner, item)) throw new Error('Unable to persist upload');
      }
      // Persisted before publishing. If the ACK disappears, retry over HTTP with the same clientId.
      const destination = item.destination === '/messages' ? '/app/chat.send'
        : item.destination.replace(/^\/rooms\/(\d+)\/messages$/, '/app/rooms/$1/send');
      if (websocket && wsService.sendMessage(destination, item.body)) {
        nextAttempt.current.set(item.id, Date.now() + 10_000);
        o.scheduleOptimisticSendTimeout(item.id);
        return;
      }
      const response = await apiClient.post<Message>(item.destination, item.body);
      if (!active()) return;
      const message = response.data;
      await dbService.saveMessagesCache(owner, item.conversationKey!, [message]);
      await dbService.removePendingMessage(owner, item.id);
      if (!active()) return;
      attempts.current.delete(item.id);
      nextAttempt.current.delete(item.id);
      o.clearOptimisticSendTimeout(item.id);
      o.setMessages((messages) => isActiveConversationMessage(message, owner,
        latest.current.selectedUserIdRef.current, latest.current.selectedRoomIdRef.current)
        ? appendOrReconcileMessage(messages, message) : messages);
      if (message.chatRoomId) {
        o.setRooms((rooms) => applyRoomPreviewToRooms(rooms, message, owner, latest.current.selectedRoomIdRef.current));
        o.setSelectedRoom((room) => room && room.id === message.chatRoomId
          ? { ...applyRoomPreviewToRoom(room, message), unreadCount: 0 } : room);
      } else {
        o.setUsers((users) => applyConversationPreviewToUsers(users, message, owner, !o.userSearchQueryRef.current.trim()));
        o.setFriends((friends) => applyConversationPreviewToUsers(friends, message, owner, true));
        o.setSelectedUser((user) => user ? applyConversationPreviewToUser(user, message, owner) : null);
      }
      if (isActiveConversationMessage(message, owner, latest.current.selectedUserIdRef.current,
        latest.current.selectedRoomIdRef.current)) o.addIncomingSharedContent(message);
    } catch (error) {
      if (!active()) return;
      const status = (error as { response?: { status: number } }).response?.status;
      const permanent = status !== undefined && status >= 400 && status < 500 && ![401, 408, 429].includes(status);
      if (permanent) {
        await dbService.enqueuePendingMessage(owner, { ...item, failed: true });
        latest.current.clearOptimisticSendTimeout(item.id);
        latest.current.setMessages((messages) => markOptimisticMessageFailed(messages, item.id));
      } else {
        const count = (attempts.current.get(item.id) ?? 0) + 1;
        attempts.current.set(item.id, count);
        nextAttempt.current.set(item.id, Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(count, 6)));
      }
    } finally {
      inFlight.current.delete(item.id);
    }
  }, []);

  useEffect(() => {
    const owner = options.currentUserId;
    if (!owner) return;
    let active = true;
    let draining = false;
    const drain = async () => {
      if (draining || !active || navigator.onLine === false) return;
      draining = true;
      try {
        const queue = await dbService.getPendingQueue(owner);
        for (const item of queue.sort((a, b) => a.timestamp - b.timestamp)) {
          if (!active) break;
          if (item.optimistic && !item.failed && (nextAttempt.current.get(item.id) ?? 0) <= Date.now()) {
            await deliver(item);
          }
        }
      } finally { draining = false; }
    };
    const online = () => { nextAttempt.current.clear(); void drain(); };
    const timer = window.setInterval(() => { void drain(); }, 2000);
    window.addEventListener('online', online);
    void drain();
    return () => {
      active = false;
      lifetime.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('online', online);
    };
  }, [options.currentUserId, deliver]);

  const send = useCallback(async (clientId: string) => {
    const owner = latest.current.currentUserIdRef.current;
    if (!owner) return;
    const item = (await dbService.getPendingQueue(owner)).find((entry) => entry.id === clientId);
    if (!item) return;
    if (item.failed && !await dbService.enqueuePendingMessage(owner, { ...item, failed: false })) return;
    await deliver({ ...item, failed: false }, true);
  }, [deliver]);
  const sendOptimisticMessage = useCallback((payload: SendMessagePayload) => send(payload.clientId), [send]);
  const sendOptimisticRoomMessage = useCallback((_roomId: number, payload: SendRoomMessagePayload) => send(payload.clientId), [send]);
  return { sendOptimisticMessage, sendOptimisticRoomMessage };
}
