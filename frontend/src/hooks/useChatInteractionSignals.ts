import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ChatRoom, ReadReceiptEvent, RoomReadReceiptEvent, User } from '../types';
import type { ChatMessage, PendingReadConversation } from '../types/chat.types';
import { apiClient } from '../services/api';
import { wsService } from '../services/websocket';
import { OPTIMISTIC_SEND_TIMEOUT_MS, READ_BOTTOM_THRESHOLD, REMOTE_TYPING_VISIBLE_MS } from '../constants/chatConstants';
import { appendSeenByUser, applyReadReceipt, isMessagesContainerNearBottom, markOptimisticMessageFailed } from '../utils/messageUtils';
import { appendOrUpdateRoom } from '../utils/conversationUtils';
import { resetRoomUnreadCount, resetUnreadCount } from '../utils/userUtils';

const TYPING_DESTINATION = '/app/chat.typing';
const READ_RECEIPT_DESTINATION = '/app/chat.read';
const GROUP_MESSAGE_DESTINATION_PREFIX = '/app/rooms';

type MutableRef<T> = { current: T };

export interface UseChatInteractionSignalsOptions {
  currentUserIdRef: MutableRef<number | null>;
  selectedRoomIdRef: MutableRef<number | null>;
  messagesRef: MutableRef<ChatMessage[]>;
  messagesContainerRef: MutableRef<HTMLDivElement | null>;
  pendingReadConversationRef: MutableRef<PendingReadConversation>;
  typingTimeoutRef: MutableRef<ReturnType<typeof setTimeout> | null>;
  remoteTypingTimeoutsRef: MutableRef<Map<number, ReturnType<typeof setTimeout>>>;
  sendTimeoutsRef: MutableRef<Map<string, ReturnType<typeof setTimeout>>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setRemoteTypingUserIds: Dispatch<SetStateAction<number[]>>;
  setRoomSeenByByMessageId: Dispatch<SetStateAction<Record<number, User[]>>>;
  setUnreadDividerMessageId: (messageId: number | null) => void;
  findKnownUserById: (userId: number) => User | null;
}

export function useChatInteractionSignals({
  currentUserIdRef,
  selectedRoomIdRef,
  messagesRef,
  messagesContainerRef,
  pendingReadConversationRef,
  typingTimeoutRef,
  remoteTypingTimeoutsRef,
  sendTimeoutsRef,
  setMessages,
  setUsers,
  setFriends,
  setRooms,
  setSelectedRoom,
  setRemoteTypingUserIds,
  setRoomSeenByByMessageId,
  setUnreadDividerMessageId,
  findKnownUserById,
}: UseChatInteractionSignalsOptions) {
  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [typingTimeoutRef]);

  const clearRemoteTypingTimeout = useCallback((senderId?: number) => {
    if (senderId !== undefined) {
      const timeout = remoteTypingTimeoutsRef.current.get(senderId);
      if (timeout) {
        clearTimeout(timeout);
        remoteTypingTimeoutsRef.current.delete(senderId);
      }
      return;
    }
    remoteTypingTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    remoteTypingTimeoutsRef.current.clear();
  }, [remoteTypingTimeoutsRef]);

  const clearOptimisticSendTimeout = useCallback((clientId: string) => {
    const timeout = sendTimeoutsRef.current.get(clientId);
    if (!timeout) return;
    clearTimeout(timeout);
    sendTimeoutsRef.current.delete(clientId);
  }, [sendTimeoutsRef]);

  const clearOptimisticSendTimeouts = useCallback(() => {
    sendTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    sendTimeoutsRef.current.clear();
  }, [sendTimeoutsRef]);

  const scheduleOptimisticSendTimeout = useCallback((clientId: string) => {
    clearOptimisticSendTimeout(clientId);
    const timeout = setTimeout(() => {
      sendTimeoutsRef.current.delete(clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, clientId));
    }, OPTIMISTIC_SEND_TIMEOUT_MS);
    sendTimeoutsRef.current.set(clientId, timeout);
  }, [clearOptimisticSendTimeout, sendTimeoutsRef, setMessages]);

  const showRemoteTyping = useCallback((senderId: number) => {
    setRemoteTypingUserIds((currentIds) => currentIds.includes(senderId) ? currentIds : [...currentIds, senderId]);
    clearRemoteTypingTimeout(senderId);
    const timeout = setTimeout(() => {
      setRemoteTypingUserIds((currentIds) => currentIds.filter((id) => id !== senderId));
      remoteTypingTimeoutsRef.current.delete(senderId);
    }, REMOTE_TYPING_VISIBLE_MS);
    remoteTypingTimeoutsRef.current.set(senderId, timeout);
  }, [clearRemoteTypingTimeout, remoteTypingTimeoutsRef, setRemoteTypingUserIds]);

  const hideRemoteTyping = useCallback((senderId?: number) => {
    clearRemoteTypingTimeout(senderId);
    setRemoteTypingUserIds((currentIds) => senderId === undefined ? [] : currentIds.filter((id) => id !== senderId));
  }, [clearRemoteTypingTimeout, setRemoteTypingUserIds]);

  const publishTyping = useCallback((receiverId: number, typing: boolean) => {
    wsService.sendMessage(TYPING_DESTINATION, { receiverId, typing });
  }, []);
  const stopTyping = useCallback((receiverId: number) => {
    clearTypingTimeout();
    publishTyping(receiverId, false);
  }, [clearTypingTimeout, publishTyping]);
  const publishRoomTyping = useCallback((roomId: number, typing: boolean) => {
    wsService.sendMessage(`${GROUP_MESSAGE_DESTINATION_PREFIX}/${roomId}/typing`, { typing });
  }, []);
  const stopRoomTyping = useCallback((roomId: number) => {
    clearTypingTimeout();
    publishRoomTyping(roomId, false);
  }, [clearTypingTimeout, publishRoomTyping]);

  const markConversationAsRead = useCallback(async (senderId: number) => {
    setUsers((currentUsers) => resetUnreadCount(currentUsers, senderId));
    setFriends((currentFriends) => resetUnreadCount(currentFriends, senderId));
    const sentRealtime = wsService.sendMessage(READ_RECEIPT_DESTINATION, { senderId });
    if (!sentRealtime) {
      try {
        const response = await apiClient.patch<ReadReceiptEvent>(`/messages/${senderId}/read`);
        setMessages((currentMessages) => applyReadReceipt(currentMessages, response.data));
      } catch (error) {
        console.error('Failed to mark conversation as read:', error);
      }
    }
  }, [setFriends, setMessages, setUsers]);

  const markRoomAsRead = useCallback(async (roomId: number) => {
    setRooms((currentRooms) => resetRoomUnreadCount(currentRooms, roomId));
    setSelectedRoom((currentRoom) => currentRoom?.id === roomId ? { ...currentRoom, unreadCount: 0 } : currentRoom);
    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${roomId}/read`);
      setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, response.data));
      setSelectedRoom((currentRoom) => currentRoom?.id === roomId ? response.data : currentRoom);
    } catch (error) {
      console.error('Failed to mark group as read:', error);
    }
  }, [setRooms, setSelectedRoom]);

  const applyRoomReadReceipt = useCallback((receipt: RoomReadReceiptEvent) => {
    const currentUserId = currentUserIdRef.current;
    if (currentUserId === null || receipt.readerId === currentUserId || receipt.roomId !== selectedRoomIdRef.current) return;
    const reader = findKnownUserById(receipt.readerId);
    const readAt = Date.parse(receipt.readAt);
    if (!reader || Number.isNaN(readAt)) return;
    const readMessageIds = messagesRef.current.filter((message) => {
      const timestamp = Date.parse(message.timestamp);
      return message.id > 0 && message.chatRoomId === receipt.roomId && message.senderId === currentUserId && !message.recalled && !Number.isNaN(timestamp) && timestamp <= readAt;
    }).map((message) => message.id);
    if (readMessageIds.length === 0) return;
    setRoomSeenByByMessageId((currentSeenBy) => {
      let changed = false;
      const nextSeenBy = { ...currentSeenBy };
      readMessageIds.forEach((messageId) => {
        const currentReaders = nextSeenBy[messageId] ?? [];
        const nextReaders = appendSeenByUser(currentReaders, reader);
        if (nextReaders !== currentReaders) {
          nextSeenBy[messageId] = nextReaders;
          changed = true;
        }
      });
      return changed ? nextSeenBy : currentSeenBy;
    });
  }, [currentUserIdRef, findKnownUserById, messagesRef, selectedRoomIdRef, setRoomSeenByByMessageId]);

  const flushPendingReadConversation = useCallback(() => {
    const pendingConversation = pendingReadConversationRef.current;
    if (!pendingConversation) return false;
    pendingReadConversationRef.current = null;
    setUnreadDividerMessageId(null);
    if (pendingConversation.type === 'user') void markConversationAsRead(pendingConversation.id);
    else void markRoomAsRead(pendingConversation.id);
    return true;
  }, [markConversationAsRead, markRoomAsRead, pendingReadConversationRef, setUnreadDividerMessageId]);

  const completePendingReadIfAtBottom = useCallback(() => {
    if (!pendingReadConversationRef.current || !isMessagesContainerNearBottom(messagesContainerRef.current, READ_BOTTOM_THRESHOLD)) return false;
    return flushPendingReadConversation();
  }, [flushPendingReadConversation, messagesContainerRef, pendingReadConversationRef]);

  return {
    clearTypingTimeout,
    clearRemoteTypingTimeout,
    clearOptimisticSendTimeout,
    clearOptimisticSendTimeouts,
    scheduleOptimisticSendTimeout,
    showRemoteTyping,
    hideRemoteTyping,
    publishTyping,
    stopTyping,
    publishRoomTyping,
    stopRoomTyping,
    markConversationAsRead,
    markRoomAsRead,
    applyRoomReadReceipt,
    flushPendingReadConversation,
    completePendingReadIfAtBottom,
  };
}

export default useChatInteractionSignals;
