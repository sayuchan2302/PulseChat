import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Message, MessagePage } from '../types';
import type { ChatMessage, LoadOptions } from '../types/chat.types';
import { apiClient } from '../services/api';
import { dbService } from '../services/dbService';
import { MESSAGE_PAGE_SIZE } from '../constants/chatConstants';
import { mergeServerMessagesWithPending } from '../utils/messageUtils';

interface UseMessageLoadersOptions {
  currentUserIdRef: MutableRefObject<number | null>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  resetMessagePagination: () => void;
  applyMessagePagination: (page: MessagePage) => void;
  applyPendingUnreadDivider: (items: ChatMessage[], type: 'user' | 'room', id: number) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessagesLoading: Dispatch<SetStateAction<boolean>>;
  setMessagesError: Dispatch<SetStateAction<string>>;
}


export function useMessageLoaders(options: UseMessageLoadersOptions) {
  const latest = useRef(options);
  latest.current = options;
  const requestId = useRef(0);
  const load = useCallback(async (type: 'user' | 'room', id: number, settings: LoadOptions = {}) => {
    const o = latest.current;
    const owner = o.currentUserIdRef.current;
    if (!owner) return;
    const request = ++requestId.current;
    const active = () => requestId.current === request && o.currentUserIdRef.current === owner &&
      (type === 'user' ? o.selectedUserIdRef.current === id : o.selectedRoomIdRef.current === id);
    const key = `${type}_${id}`;
    if (!settings.silent) {
      o.resetMessagePagination();
      o.setMessages([]);
      o.setMessagesLoading(true);
    }
    o.setMessagesError('');
    let cached: ChatMessage[] = [];
    try {
      const [history, queue] = await Promise.all([
        dbService.getMessagesCache(owner, key), dbService.getPendingQueue(owner),
      ]);
      if (!active()) return;
      const pending = queue.filter((item) => item.conversationKey === key && item.optimistic)
        .map((item) => ({ ...item.optimistic!, deliveryStatus: item.failed ? 'failed' as const : 'sending' as const }));
      cached = mergeServerMessagesWithPending(pending, history);
      const known = settings.silent ? [...cached, ...o.messagesRef.current] : cached;
      const ids = known.filter((message) => message.id > 0).map((message) => message.id);
      const floor = ids.length ? Math.min(...ids) : undefined;
      if (!settings.silent) {
        o.setMessages(cached);
        if (cached.length) o.setMessagesLoading(false);
      }
      // Walk backwards to the oldest known message, including every page in the gap.
      // Apply only a complete snapshot so an interrupted sync cannot advance its boundary.
      const path = type === 'user' ? `/messages/${id}` : `/rooms/${id}/messages`;
      const server: Message[] = [];
      let before: number | undefined;
      let page: MessagePage;
      do {
        page = (await apiClient.get<MessagePage>(path, { params: { size: MESSAGE_PAGE_SIZE, before } })).data;
        if (!active()) return;
        server.push(...page.items);
        if (!page.hasMore || !page.nextBefore || floor === undefined || page.nextBefore <= floor) break;
        if (before !== undefined && page.nextBefore >= before) throw new Error('Invalid history cursor');
        before = page.nextBefore;
      } while (active());
      if (!active()) return;
      if (server.length === 0) {
        o.setMessages(pending);
        await dbService.replaceMessagesCache(owner, key, []);
        return;
      }
      const oldest = Math.min(...server.map((message) => message.id));
      const newest = Math.max(...server.map((message) => message.id));
      o.setMessages((current) => mergeServerMessagesWithPending(
        [...pending.filter((item) => !current.some((message) => message.clientId === item.clientId && message.senderId === item.senderId)),
          ...current.filter((message) => message.id < 0 || message.id > newest || (floor !== undefined && message.id < oldest))],
        server));
      o.applyMessagePagination(page!);
      if (!settings.silent) o.applyPendingUnreadDivider(server, type, id);
      await dbService.replaceMessagesCache(owner, key, server,
        floor === undefined ? undefined : oldest,
        floor === undefined ? undefined : newest);
      for (const message of server) {
        if (message.senderId === owner && message.clientId) await dbService.removePendingMessage(owner, message.clientId);
      }
    } catch (error) {
      if (!active()) return;
      const status = (error as { response?: { status: number } }).response?.status;
      if (status === 403 || status === 404) {
        o.setMessages([]);
        await dbService.replaceMessagesCache(owner, key, []);
      }
      o.setMessagesError(cached.length && !status
        ? 'Offline: showing saved messages. Pending messages will retry when connected.'
        : 'Unable to sync messages. Please try again.');
    } finally {
      if (active()) o.setMessagesLoading(false);
    }
  }, []);
  const loadMessages = useCallback((id: number, settings?: LoadOptions) => load('user', id, settings), [load]);
  const loadRoomMessages = useCallback((id: number, settings?: LoadOptions) => load('room', id, settings), [load]);
  useEffect(() => {
    const online = () => {
      const o = latest.current;
      if (o.selectedUserIdRef.current !== null) void loadMessages(o.selectedUserIdRef.current, { silent: true });
      else if (o.selectedRoomIdRef.current !== null) void loadRoomMessages(o.selectedRoomIdRef.current, { silent: true });
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [loadMessages, loadRoomMessages]);
  return { loadMessages, loadRoomMessages };
}
