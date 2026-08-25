import { useMemo } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type {
  CallSignalEvent,
  ChatRoom,
  ConnectionStatus,
  Friendship,
  PresenceEvent,
  ReadReceiptEvent,
  RoomReadReceiptEvent,
  TypingEvent,
  User,
} from '../types';
import type { ChatMessage, ChatBrowserNotification, LoadOptions } from '../types/chat.types';
import type { ChatRealtimeHandlers } from './useChatRealtime';
import { applyReadReceipt } from '../utils/messageUtils';
import { applyPresenceToUser, isTypingFromSelectedUser, resetUnreadCount } from '../utils/userUtils';

type EventHandlers = Omit<ChatRealtimeHandlers, 'onConnect' | 'onMessage'>;
type SilentLoader = (options?: LoadOptions) => Promise<unknown>;

interface Options {
  realtimeActiveRef: MutableRefObject<boolean>;
  hasConnectedRef: MutableRefObject<boolean>;
  currentUserIdRef: MutableRefObject<number | null>;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  messagesContainerRef: MutableRefObject<HTMLDivElement | null>;
  isMessagesContainerNearBottom: (container: HTMLDivElement | null, threshold: number) => boolean;
  readBottomThreshold: number;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  showRemoteTyping: (userId: number) => void;
  hideRemoteTyping: (userId: number) => void;
  getBrowserAwareConnectionStatus: (status: ConnectionStatus) => ConnectionStatus;
  loadUsers: SilentLoader;
  loadRooms: SilentLoader;
  loadIncomingFriendRequests: SilentLoader;
  loadFriendSummary: SilentLoader;
  loadMessages: (userId: number, options?: LoadOptions) => Promise<unknown>;
  loadRoomMessages: (roomId: number, options?: LoadOptions) => Promise<unknown>;
  markConversationAsRead: (userId: number) => Promise<void>;
  markRoomAsRead: (roomId: number) => Promise<void>;
  applyRoomMembershipUpdate: (room: ChatRoom) => void;
  buildFriendshipNotification: (friendship: Friendship) => ChatBrowserNotification | null;
  notifyWithBrowserNotification: (notification: ChatBrowserNotification, isMention?: boolean) => void;
  applyMessageUpdate: (message: ChatMessage) => void;
  applyRoomReadReceipt: (receipt: RoomReadReceiptEvent) => void;
  handleCallSignal: (event: CallSignalEvent) => void;
  clearTypingTimeout: () => void;
  clearRemoteTypingTimeout: () => void;
  clearOptimisticSendTimeouts: () => void;
  sendActiveCallCloseSignal: () => void;
  stopCallMedia: () => void;
}

export function useRealtimeEventHandlers(options: Options): EventHandlers {
  const {
    realtimeActiveRef, hasConnectedRef, currentUserIdRef, selectedUserIdRef, selectedRoomIdRef,
    messagesContainerRef, isMessagesContainerNearBottom, readBottomThreshold, setCurrentUser,
    setUsers, setFriends, setSelectedUser, setMessages,
    showRemoteTyping, hideRemoteTyping, getBrowserAwareConnectionStatus, loadUsers, loadRooms,
    loadIncomingFriendRequests, loadFriendSummary, loadMessages, loadRoomMessages,
    markConversationAsRead, markRoomAsRead, applyRoomMembershipUpdate,
    buildFriendshipNotification, notifyWithBrowserNotification, applyMessageUpdate,
    applyRoomReadReceipt, handleCallSignal, clearTypingTimeout, clearRemoteTypingTimeout,
    clearOptimisticSendTimeouts, sendActiveCallCloseSignal, stopCallMedia,
  } = options;

  return useMemo(() => ({
    onPresence: (presence: PresenceEvent) => {
      if (!realtimeActiveRef.current) return;
      setUsers((users) => users.map((user) => applyPresenceToUser(user, presence)));
      setFriends((friends) => friends.map((friend) => applyPresenceToUser(friend, presence)));
      setSelectedUser((user) => user ? applyPresenceToUser(user, presence) : null);
      if (presence.userId === currentUserIdRef.current) {
        setCurrentUser((user) => user ? applyPresenceToUser(user, presence) : null);
      }
    },
    onTyping: (typing: TypingEvent) => {
      if (!realtimeActiveRef.current || typing.senderId === currentUserIdRef.current) return;
      if (typing.roomId) {
        if (typing.roomId !== selectedRoomIdRef.current) return;
      } else if (!isTypingFromSelectedUser(typing, selectedUserIdRef.current)) return;
      if (typing.typing) showRemoteTyping(typing.senderId);
      else hideRemoteTyping(typing.senderId);
    },
    onReadReceipt: (receipt: ReadReceiptEvent) => {
      if (!realtimeActiveRef.current) return;
      setMessages((messages) => applyReadReceipt(messages, receipt));
      if (receipt.readerId === currentUserIdRef.current) {
        setUsers((users) => resetUnreadCount(users, receipt.senderId));
        setFriends((friends) => resetUnreadCount(friends, receipt.senderId));
      }
    },
    onConnectionStatus: (status: ConnectionStatus) => {
      if (!realtimeActiveRef.current) return;
      const isOnline = getBrowserAwareConnectionStatus(status) === 'connected';
      setCurrentUser((user) => !user || user.online === isOnline ? user : { ...user, online: isOnline });
      if (!isOnline) return;
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        return;
      }
      const selectedUserId = selectedUserIdRef.current;
      const selectedRoomId = selectedRoomIdRef.current;
      void Promise.all([
        loadUsers({ silent: true }),
        loadRooms({ silent: true }),
        loadIncomingFriendRequests({ silent: true }),
        loadFriendSummary({ silent: true }),
        selectedUserId !== null ? loadMessages(selectedUserId, { silent: true })
          : selectedRoomId !== null ? loadRoomMessages(selectedRoomId, { silent: true }) : Promise.resolve(),
      ]).then(() => {
        const nearBottom = isMessagesContainerNearBottom(
          messagesContainerRef.current,
          readBottomThreshold,
        );
        if (selectedUserId !== null && selectedUserIdRef.current === selectedUserId && nearBottom) {
          void markConversationAsRead(selectedUserId);
        } else if (selectedRoomId !== null && selectedRoomIdRef.current === selectedRoomId && nearBottom) {
          void markRoomAsRead(selectedRoomId);
        }
      }).catch((error) => console.error('Failed to resync chat state:', error));
    },
    onRoom: (room: ChatRoom) => {
      if (realtimeActiveRef.current) applyRoomMembershipUpdate(room);
    },
    onFriendship: (friendship: Friendship) => {
      if (!realtimeActiveRef.current) return;
      const notification = buildFriendshipNotification(friendship);
      if (notification) notifyWithBrowserNotification(notification);
      void Promise.all([
        loadUsers({ silent: true }),
        loadIncomingFriendRequests({ silent: true }),
        loadFriendSummary({ silent: true }),
      ]);
    },
    onMessageUpdate: (message: ChatMessage) => {
      if (realtimeActiveRef.current) applyMessageUpdate(message);
    },
    onRoomReadReceipt: (receipt: RoomReadReceiptEvent) => {
      if (realtimeActiveRef.current) applyRoomReadReceipt(receipt);
    },
    onCallSignal: (event: CallSignalEvent) => {
      if (realtimeActiveRef.current) handleCallSignal(event);
    },
    onDisconnect: () => {
      realtimeActiveRef.current = false;
      hasConnectedRef.current = false;
      clearTypingTimeout();
      clearRemoteTypingTimeout();
      clearOptimisticSendTimeouts();
      sendActiveCallCloseSignal();
      stopCallMedia();
    },
  }), [
    applyMessageUpdate, applyRoomMembershipUpdate, applyRoomReadReceipt, buildFriendshipNotification,
    clearOptimisticSendTimeouts, clearRemoteTypingTimeout, clearTypingTimeout,
    currentUserIdRef, getBrowserAwareConnectionStatus, handleCallSignal, hasConnectedRef,
    hideRemoteTyping, loadFriendSummary, loadIncomingFriendRequests, loadMessages, loadRoomMessages,
    loadRooms, loadUsers, markConversationAsRead, markRoomAsRead, messagesContainerRef,
    isMessagesContainerNearBottom, readBottomThreshold,
    notifyWithBrowserNotification, realtimeActiveRef, selectedRoomIdRef, selectedUserIdRef,
    sendActiveCallCloseSignal, setCurrentUser, setFriends, setMessages, setSelectedUser, setUsers,
    showRemoteTyping, stopCallMedia,
  ]);
}
