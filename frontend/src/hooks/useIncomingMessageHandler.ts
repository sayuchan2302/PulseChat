import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, Message, User } from '../types';
import type { ChatBrowserNotification, ChatMessage } from '../types/chat.types';
import { appendOrReconcileMessage, isActiveConversationMessage } from '../utils/messageUtils';
import {
  applyConversationPreviewToUser,
  applyConversationPreviewToUsers,
  applyRoomPreviewToRoom,
  applyRoomPreviewToRooms,
  isMutedIncomingConversation,
} from '../utils/conversationUtils';
import { incrementUnreadCount } from '../utils/userUtils';

interface Options {
  realtimeActiveRef: MutableRefObject<boolean>;
  currentUserIdRef: MutableRefObject<number | null>;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  userSearchQueryRef: MutableRefObject<string>;
  usersRef: MutableRefObject<User[]>;
  friendsRef: MutableRefObject<User[]>;
  roomsRef: MutableRefObject<ChatRoom[]>;
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  pendingReadConversationRef: MutableRefObject<unknown>;
  autoScrollBottomThreshold: number;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  isMessagesContainerNearBottom: (container: HTMLDivElement | null, threshold: number) => boolean;
  addIncomingSharedContent: (message: Message) => void;
  clearOptimisticSendTimeout: (clientId: string) => void;
  buildMessageNotification: (message: Message) => ChatBrowserNotification;
  notifyWithBrowserNotification: (notification: ChatBrowserNotification, isMention?: boolean) => void;
  restoreMissingRoom: (message: Message, isIncoming: boolean, isActive: boolean) => void;
  restoreMissingDirectSender: (message: Message, currentUserId: number | null) => void;
  markConversationAsRead: (userId: number) => Promise<void>;
  markRoomAsRead: (roomId: number) => Promise<void>;
  addPendingUnreadMessage: (type: 'user' | 'room', conversationId: number, message: Message) => void;
}

export function useIncomingMessageHandler({
  realtimeActiveRef, currentUserIdRef, selectedUserIdRef, selectedRoomIdRef, userSearchQueryRef,
  usersRef, friendsRef, roomsRef, messagesContainerRef, pendingReadConversationRef,
  autoScrollBottomThreshold, setMessages, setUsers, setFriends, setRooms, setSelectedUser,
  setSelectedRoom, isMessagesContainerNearBottom, addIncomingSharedContent,
  clearOptimisticSendTimeout, buildMessageNotification, notifyWithBrowserNotification,
  restoreMissingRoom, restoreMissingDirectSender, markConversationAsRead, markRoomAsRead,
  addPendingUnreadMessage,
}: Options) {
  return useCallback((incomingMessage: Message) => {
    if (!realtimeActiveRef.current) return;

    const currentUserId = currentUserIdRef.current;
    const selectedUserId = selectedUserIdRef.current;
    const selectedRoomId = selectedRoomIdRef.current;
    const isIncomingFromOther = incomingMessage.senderId !== currentUserId;
    const isActiveMessage = isActiveConversationMessage(incomingMessage, currentUserId, selectedUserId, selectedRoomId);
    const pageIsFocused = typeof document === 'undefined' || (!document.hidden && document.hasFocus());
    const wasAtBottom = isActiveMessage && isMessagesContainerNearBottom(
      messagesContainerRef.current, autoScrollBottomThreshold,
    );
    const canMarkActiveIncomingAsRead = isIncomingFromOther && pageIsFocused && wasAtBottom &&
      pendingReadConversationRef.current === null;
    const conversationMuted = isMutedIncomingConversation(
      incomingMessage, currentUserId, usersRef.current, friendsRef.current, roomsRef.current,
    );
    const shouldNotify = isIncomingFromOther && !conversationMuted && (!isActiveMessage || !pageIsFocused);

    setMessages((messages) => isActiveConversationMessage(
      incomingMessage, currentUserId, selectedUserId, selectedRoomId,
    ) ? appendOrReconcileMessage(messages, incomingMessage) : messages);
    addIncomingSharedContent(incomingMessage);
    if (incomingMessage.clientId) clearOptimisticSendTimeout(incomingMessage.clientId);
    if (shouldNotify) {
      const notification = buildMessageNotification(incomingMessage);
      notifyWithBrowserNotification(notification, notification.isMention);
    }

    if (incomingMessage.chatRoomId) {
      const isActiveRoomMessage = incomingMessage.chatRoomId === selectedRoomId;
      restoreMissingRoom(incomingMessage, isIncomingFromOther, isActiveRoomMessage);
      setRooms((rooms) => applyRoomPreviewToRooms(rooms, incomingMessage, currentUserId, selectedRoomId));
      setSelectedRoom((room) => {
        if (!room || room.id !== incomingMessage.chatRoomId) return room;
        const withPreview = applyRoomPreviewToRoom(room, incomingMessage);
        return {
          ...withPreview,
          unreadCount: isIncomingFromOther && !isActiveRoomMessage ? (withPreview.unreadCount ?? 0) + 1 : 0,
        };
      });
      if (isIncomingFromOther && isActiveRoomMessage) {
        if (canMarkActiveIncomingAsRead) void markRoomAsRead(incomingMessage.chatRoomId);
        else addPendingUnreadMessage('room', incomingMessage.chatRoomId, incomingMessage);
      }
      return;
    }

    if (isIncomingFromOther) restoreMissingDirectSender(incomingMessage, currentUserId);
    setUsers((users) => applyConversationPreviewToUsers(
      users, incomingMessage, currentUserId, !userSearchQueryRef.current.trim(),
    ));
    setFriends((friends) => applyConversationPreviewToUsers(friends, incomingMessage, currentUserId, true));
    setSelectedUser((user) => user ? applyConversationPreviewToUser(user, incomingMessage, currentUserId) : null);
    if (isIncomingFromOther && incomingMessage.senderId === selectedUserId) {
      if (canMarkActiveIncomingAsRead) void markConversationAsRead(incomingMessage.senderId);
      else {
        addPendingUnreadMessage('user', incomingMessage.senderId, incomingMessage);
        setSelectedUser((user) => user?.id === incomingMessage.senderId ? { ...user, unreadCount: 0 } : user);
      }
      return;
    }
    if (isIncomingFromOther) {
      setUsers((users) => incrementUnreadCount(users, incomingMessage.senderId));
      setFriends((friends) => incrementUnreadCount(friends, incomingMessage.senderId));
    }
  }, [
    addIncomingSharedContent, addPendingUnreadMessage, autoScrollBottomThreshold,
    buildMessageNotification, clearOptimisticSendTimeout, currentUserIdRef, friendsRef,
    isMessagesContainerNearBottom, markConversationAsRead, markRoomAsRead, messagesContainerRef,
    notifyWithBrowserNotification, pendingReadConversationRef, realtimeActiveRef,
    restoreMissingDirectSender, restoreMissingRoom, roomsRef, selectedRoomIdRef, selectedUserIdRef,
    setFriends, setMessages, setRooms, setSelectedRoom, setSelectedUser, setUsers,
    userSearchQueryRef, usersRef,
  ]);
}

export default useIncomingMessageHandler;
