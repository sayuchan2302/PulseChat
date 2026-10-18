import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { dbService } from '../services/dbService';
import type { ChatRoom, User } from '../types';
import type { ChatMessage } from '../types/chat.types';

/** Debounce IndexedDB cache writes so bursts of message/typing updates collapse into one write. */
const CACHE_WRITE_DEBOUNCE_MS = 400;

/** Wait time until the next cache write: full debounce window, but never more than 400ms after the previous write. */
const cacheWriteDelay = (lastWrittenAt: number) =>
  Math.max(0, CACHE_WRITE_DEBOUNCE_MS - (Date.now() - lastWrittenAt));

interface UseOfflineCacheOptions {
  currentUserId: number | null;
  rooms: ChatRoom[];
  users: User[];
  messages: ChatMessage[];
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
}

/**
 * Restores the conversations shown before a reload and persists conversations/messages to
 * IndexedDB, debounced so typing bursts collapse into a single write per window.
 */
export function useOfflineCache({
  currentUserId,
  rooms,
  users,
  messages,
  selectedUser,
  selectedRoom,
  setRooms,
  setUsers,
}: UseOfflineCacheOptions) {
  const conversationsCacheWrittenAtRef = useRef(0);
  const messagesCacheWrittenAtRef = useRef(0);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    dbService.getConversationsCache(currentUserId, 'conversations_cache').then((cached) => {
      if (active && cached && cached.rooms && cached.users) {
        setRooms((prev) => (prev.length === 0 ? cached.rooms : prev));
        setUsers((prev) => (prev.length === 0 ? cached.users : prev));
      }
    }).catch(() => { });
    return () => { active = false; };
  }, [currentUserId, setRooms, setUsers]);

  useEffect(() => {
    if (!currentUserId || (rooms.length === 0 && users.length === 0)) return;
    const userId = currentUserId;
    const timeoutId = window.setTimeout(() => {
      conversationsCacheWrittenAtRef.current = Date.now();
      void dbService.saveConversationsCache(userId, 'conversations_cache', { rooms, users });
    }, cacheWriteDelay(conversationsCacheWrittenAtRef.current));
    return () => window.clearTimeout(timeoutId);
  }, [currentUserId, rooms, users]);

  useEffect(() => {
    if (!currentUserId || messages.length === 0) return;
    const key = selectedUser ? `user_${selectedUser.id}` : selectedRoom ? `room_${selectedRoom.id}` : null;
    if (!key) return;
    const userId = currentUserId;
    const cachedMessages = messages.filter((message) =>
      selectedRoom ? message.chatRoomId === selectedRoom.id : !message.chatRoomId &&
        ((message.senderId === userId && message.receiverId === selectedUser?.id) ||
         (message.receiverId === userId && message.senderId === selectedUser?.id)));
    const timeoutId = window.setTimeout(() => {
      messagesCacheWrittenAtRef.current = Date.now();
      void dbService.saveMessagesCache(userId, key, cachedMessages);
    }, cacheWriteDelay(messagesCacheWrittenAtRef.current));
    return () => window.clearTimeout(timeoutId);
  }, [currentUserId, messages, selectedUser, selectedRoom]);
}
