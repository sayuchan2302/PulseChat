import { useMemo, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  CallSignalEvent,
  ChatRoom,
  Friendship,
  Message,
  MessageHiddenEvent,
  User,
} from '../types';
import type {
  ChatBrowserNotification,
  ChatMessage,
  LoadOptions,
  PendingReadConversation,
} from '../types/chat.types';
import {
  AUTO_SCROLL_BOTTOM_THRESHOLD,
  READ_BOTTOM_THRESHOLD,
} from '../constants/chatConstants';
import { getBrowserAwareConnectionStatus } from '../utils/callUtils';
import { isMessagesContainerNearBottom } from '../utils/messageUtils';
import { useChatInteractionSignals } from './useChatInteractionSignals';
import { useChatRealtime, type ChatRealtimeHandlers } from './useChatRealtime';
import { useIncomingMessageHandler } from './useIncomingMessageHandler';
import { useIncomingMessageRecovery } from './useIncomingMessageRecovery';
import { useRealtimeEventHandlers } from './useRealtimeEventHandlers';

type SilentLoader = (options?: LoadOptions) => Promise<unknown>;

interface UseChatRealtimeWorkspaceOptions {
  currentUserId: number | null;
  currentUserIdRef: MutableRefObject<number | null>;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  userSearchQueryRef: MutableRefObject<string>;
  usersRef: MutableRefObject<User[]>;
  friendsRef: MutableRefObject<User[]>;
  roomsRef: MutableRefObject<ChatRoom[]>;
  messagesRef: MutableRefObject<ChatMessage[]>;
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  pendingReadConversationRef: MutableRefObject<PendingReadConversation>;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setRemoteTypingUserIds: Dispatch<SetStateAction<number[]>>;
  setRoomSeenByByMessageId: Dispatch<SetStateAction<Record<number, User[]>>>;
  setUnreadDividerMessageId: (messageId: number | null) => void;
  findKnownUserById: (userId: number) => User | null;
  loadUsers: SilentLoader;
  loadRooms: SilentLoader;
  loadIncomingFriendRequests: SilentLoader;
  loadFriendSummary: SilentLoader;
  loadMessages: (userId: number, options?: LoadOptions) => Promise<unknown>;
  loadRoomMessages: (roomId: number, options?: LoadOptions) => Promise<unknown>;
  applyRoomMembershipUpdate: (room: ChatRoom) => void;
  applyMessageUpdate: (message: ChatMessage) => void;
  applyMessageHidden: (event: MessageHiddenEvent) => void;
  addIncomingSharedContent: (message: Message) => void;
  addPendingUnreadMessage: (type: 'user' | 'room', conversationId: number, message: Message) => void;
  buildMessageNotification: (message: Message) => ChatBrowserNotification;
  buildFriendshipNotification: (friendship: Friendship) => ChatBrowserNotification | null;
  notifyWithBrowserNotification: (notification: ChatBrowserNotification, isMention?: boolean) => void;
  handleCallSignal: (event: CallSignalEvent) => void;
  sendActiveCallCloseSignal: () => void;
  stopCallMedia: () => void;
}

export function useChatRealtimeWorkspace({
  currentUserId,
  currentUserIdRef,
  selectedUserIdRef,
  selectedRoomIdRef,
  userSearchQueryRef,
  usersRef,
  friendsRef,
  roomsRef,
  messagesRef,
  messagesContainerRef,
  pendingReadConversationRef,
  setCurrentUser,
  setUsers,
  setFriends,
  setRooms,
  setSelectedUser,
  setSelectedRoom,
  setMessages,
  setRemoteTypingUserIds,
  setRoomSeenByByMessageId,
  setUnreadDividerMessageId,
  findKnownUserById,
  loadUsers,
  loadRooms,
  loadIncomingFriendRequests,
  loadFriendSummary,
  loadMessages,
  loadRoomMessages,
  applyRoomMembershipUpdate,
  applyMessageUpdate,
  applyMessageHidden,
  addIncomingSharedContent,
  addPendingUnreadMessage,
  buildMessageNotification,
  buildFriendshipNotification,
  notifyWithBrowserNotification,
  handleCallSignal,
  sendActiveCallCloseSignal,
  stopCallMedia,
}: UseChatRealtimeWorkspaceOptions) {
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const sendTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hasConnectedRef = useRef(false);
  const realtimeActiveRef = useRef(false);

  const {
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
    completePendingReadIfAtBottom,
  } = useChatInteractionSignals({
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
  });

  const realtimeEventHandlers = useRealtimeEventHandlers({
    realtimeActiveRef,
    hasConnectedRef,
    currentUserIdRef,
    selectedUserIdRef,
    selectedRoomIdRef,
    messagesContainerRef,
    isMessagesContainerNearBottom,
    readBottomThreshold: READ_BOTTOM_THRESHOLD,
    setCurrentUser,
    setUsers,
    setFriends,
    setSelectedUser,
    setMessages,
    showRemoteTyping,
    hideRemoteTyping,
    getBrowserAwareConnectionStatus,
    loadUsers,
    loadRooms,
    loadIncomingFriendRequests,
    loadFriendSummary,
    loadMessages,
    loadRoomMessages,
    markConversationAsRead,
    markRoomAsRead,
    applyRoomMembershipUpdate,
    buildFriendshipNotification,
    notifyWithBrowserNotification,
    applyMessageUpdate,
    applyMessageHidden,
    applyRoomReadReceipt,
    handleCallSignal,
    clearTypingTimeout,
    clearRemoteTypingTimeout,
    clearOptimisticSendTimeouts,
    sendActiveCallCloseSignal,
    stopCallMedia,
  });

  const { restoreMissingRoom, restoreMissingDirectSender } = useIncomingMessageRecovery({
    realtimeActiveRef,
    usersRef,
    roomsRef,
    userSearchQueryRef,
    setUsers,
    setRooms,
  });

  const handleIncomingMessage = useIncomingMessageHandler({
    realtimeActiveRef,
    currentUserIdRef,
    selectedUserIdRef,
    selectedRoomIdRef,
    userSearchQueryRef,
    usersRef,
    friendsRef,
    roomsRef,
    messagesContainerRef,
    pendingReadConversationRef,
    autoScrollBottomThreshold: AUTO_SCROLL_BOTTOM_THRESHOLD,
    setMessages,
    setUsers,
    setFriends,
    setRooms,
    setSelectedUser,
    setSelectedRoom,
    isMessagesContainerNearBottom,
    addIncomingSharedContent,
    clearOptimisticSendTimeout,
    buildMessageNotification,
    notifyWithBrowserNotification,
    restoreMissingRoom,
    restoreMissingDirectSender,
    markConversationAsRead,
    markRoomAsRead,
    addPendingUnreadMessage,
  });

  const realtimeHandlers = useMemo<ChatRealtimeHandlers>(() => ({
    onConnect: () => {
      realtimeActiveRef.current = true;
      currentUserIdRef.current = currentUserId;
    },
    onMessage: handleIncomingMessage,
    ...realtimeEventHandlers,
  }), [
    currentUserId,
    currentUserIdRef,
    handleIncomingMessage,
    realtimeEventHandlers,
  ]);

  useChatRealtime(currentUserId ?? undefined, realtimeHandlers);

  return {
    typingTimeoutRef,
    clearOptimisticSendTimeout,
    scheduleOptimisticSendTimeout,
    hideRemoteTyping,
    publishTyping,
    stopTyping,
    publishRoomTyping,
    stopRoomTyping,
    completePendingReadIfAtBottom,
  };
}

