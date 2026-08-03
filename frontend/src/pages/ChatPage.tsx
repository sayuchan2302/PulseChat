import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, ROUTES } from '../config/constants';
import type {
  ChatRoom,
  ConnectionStatus,
  Friendship,
  FriendshipSummary,
  Message,
  PresenceEvent,
  ReadReceiptEvent,
  TypingEvent,
  UnreadCount,
  User,
} from '../types';
import { apiClient } from '../services/api';
import { wsService } from '../services/websocket';
import './ChatPage.css';

const PRIVATE_MESSAGE_DESTINATION = '/app/chat.send';
const GROUP_MESSAGE_DESTINATION_PREFIX = '/app/rooms';
const TYPING_DESTINATION = '/app/chat.typing';
const READ_RECEIPT_DESTINATION = '/app/chat.read';
const STOP_TYPING_DELAY_MS = 1500;
const USER_SEARCH_DEBOUNCE_MS = 300;
const REMOTE_TYPING_VISIBLE_MS = 2500;
const OPTIMISTIC_SEND_TIMEOUT_MS = 10000;
const MESSAGE_GROUP_THRESHOLD_MS = 5 * 60 * 1000;
const MIN_GROUP_MEMBERS = 3;
const MIN_GROUP_INVITED_MEMBERS = MIN_GROUP_MEMBERS - 1;
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_SIZE_MB = MAX_AVATAR_SIZE_BYTES / 1024 / 1024;
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_ACCEPT = ACCEPTED_AVATAR_TYPES.join(',');
const USER_SKELETON_KEYS = ['user-skeleton-1', 'user-skeleton-2', 'user-skeleton-3'];
const MESSAGE_SKELETON_KEYS = [
  'message-skeleton-1',
  'message-skeleton-2',
  'message-skeleton-3',
  'message-skeleton-4',
];

type DeliveryStatus = 'sending' | 'sent' | 'failed';

type ChatMessage = Message & {
  deliveryStatus?: DeliveryStatus;
};

type SendMessagePayload = {
  receiverId: number;
  content: string;
  clientId: string;
};

type SendRoomMessagePayload = {
  content: string;
  clientId: string;
};

type LoadOptions = {
  silent?: boolean;
  search?: string;
};

type MainView = 'chat' | 'friends' | 'requests';

type HeaderIconProps = {
  className?: string;
};

type MessageDateDividerItem = {
  type: 'date';
  key: string;
  label: string;
};

type MessageBubbleItem = {
  type: 'message';
  key: string;
  message: ChatMessage;
  groupedWithPrevious: boolean;
  groupedWithNext: boolean;
  showSender: boolean;
};

type MessageListItem = MessageDateDividerItem | MessageBubbleItem;

function FriendsIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function FriendRequestIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </svg>
  );
}

function RefreshIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12a9 9 0 0 1-15.5 6.25" />
      <path d="M3 12A9 9 0 0 1 18.5 5.75" />
      <path d="M18 3v4h4" />
      <path d="M6 21v-4H2" />
    </svg>
  );
}

function GroupPlusIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M23 11h-6" />
    </svg>
  );
}

function ProfileIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 18a5.5 5.5 0 0 1 10 0" />
    </svg>
  );
}

function InfoIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CloseIcon({ className }: HeaderIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function toDeliveredMessage(message: Message): ChatMessage {
  return {
    ...message,
    deliveryStatus: 'sent',
  };
}

function appendOrReconcileMessage(messages: ChatMessage[], incomingMessage: Message) {
  const deliveredMessage = toDeliveredMessage(incomingMessage);
  const existingMessageIndex = messages.findIndex((message) => message.id === incomingMessage.id);

  if (existingMessageIndex >= 0) {
    return messages.map((message, index) =>
      index === existingMessageIndex ? { ...message, ...deliveredMessage } : message
    );
  }

  if (incomingMessage.clientId) {
    const optimisticMessageIndex = messages.findIndex(
      (message) => message.clientId === incomingMessage.clientId
    );

    if (optimisticMessageIndex >= 0) {
      return messages.map((message, index) =>
        index === optimisticMessageIndex ? deliveredMessage : message
      );
    }
  }

  return [...messages, deliveredMessage];
}

function appendOptimisticMessage(messages: ChatMessage[], optimisticMessage: ChatMessage) {
  const alreadyExists = messages.some((message) => message.clientId === optimisticMessage.clientId);
  return alreadyExists ? messages : [...messages, optimisticMessage];
}

function appendOrUpdateRoom(rooms: ChatRoom[], incomingRoom: ChatRoom) {
  const existingRoom = rooms.some((room) => room.id === incomingRoom.id);
  const nextRooms = existingRoom
    ? rooms.map((room) => (room.id === incomingRoom.id ? incomingRoom : room))
    : [incomingRoom, ...rooms];

  return sortRoomsByChatActivity(nextRooms);
}

function mergeServerMessagesWithPending(
  currentMessages: ChatMessage[],
  serverMessages: Message[]
) {
  const deliveredMessages = serverMessages.map(toDeliveredMessage);
  const deliveredClientIds = new Set(
    deliveredMessages
      .map((message) => message.clientId)
      .filter((clientId): clientId is string => Boolean(clientId))
  );
  const pendingMessages = currentMessages.filter(
    (message) =>
      message.id < 0 &&
      message.clientId &&
      !deliveredClientIds.has(message.clientId) &&
      (message.deliveryStatus === 'sending' || message.deliveryStatus === 'failed')
  );

  return [...deliveredMessages, ...pendingMessages];
}

function isConversationMessage(
  message: Message,
  currentUserId: number | null,
  selectedUserId: number | null
) {
  if (currentUserId === null || selectedUserId === null) {
    return false;
  }

  return (
    (message.senderId === currentUserId && message.receiverId === selectedUserId) ||
    (message.senderId === selectedUserId && message.receiverId === currentUserId)
  );
}

function isActiveConversationMessage(
  message: Message,
  currentUserId: number | null,
  selectedUserId: number | null,
  selectedRoomId: number | null
) {
  if (message.chatRoomId) {
    return selectedRoomId === message.chatRoomId;
  }

  return isConversationMessage(message, currentUserId, selectedUserId);
}

function applyPresenceToUser(user: User, presence: PresenceEvent) {
  return user.id === presence.userId ? { ...user, online: presence.online } : user;
}

function applyProfileToUser(user: User, updatedUser: User) {
  if (user.id !== updatedUser.id) {
    return user;
  }

  return {
    ...user,
    ...updatedUser,
    unreadCount: user.unreadCount ?? updatedUser.unreadCount,
    friendshipStatus: user.friendshipStatus ?? updatedUser.friendshipStatus,
    friendshipId: user.friendshipId ?? updatedUser.friendshipId,
    lastMessageContent: user.lastMessageContent ?? updatedUser.lastMessageContent,
    lastMessageAt: user.lastMessageAt ?? updatedUser.lastMessageAt,
    lastMessageSenderId: user.lastMessageSenderId ?? updatedUser.lastMessageSenderId,
  };
}

function applyProfileToRoom(room: ChatRoom, updatedUser: User) {
  return {
    ...room,
    participants: room.participants.map((participant) => applyProfileToUser(participant, updatedUser)),
  };
}

function isTypingFromSelectedUser(typing: TypingEvent, selectedUserId: number | null) {
  return selectedUserId !== null && typing.senderId === selectedUserId;
}

function mergeUnreadCounts(users: User[], unreadCounts: UnreadCount[]) {
  const unreadCountByUserId = new Map(
    unreadCounts.map((unreadCount) => [unreadCount.userId, unreadCount.unreadCount])
  );

  return users.map((user) => ({
    ...user,
    unreadCount: unreadCountByUserId.get(user.id) ?? 0,
  }));
}

function incrementUnreadCount(users: User[], senderId: number) {
  return users.map((user) =>
    user.id === senderId ? { ...user, unreadCount: (user.unreadCount ?? 0) + 1 } : user
  );
}

function resetUnreadCount(users: User[], userId: number) {
  return users.map((user) => (user.id === userId ? { ...user, unreadCount: 0 } : user));
}

function resetRoomUnreadCount(rooms: ChatRoom[], roomId: number) {
  return rooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room));
}

function applyReadReceipt(messages: ChatMessage[], receipt: ReadReceiptEvent) {
  return messages.map((message) =>
    message.id > 0 && message.senderId === receipt.senderId && message.receiverId === receipt.readerId
      ? { ...message, read: true, deliveryStatus: 'sent' as const }
      : message
  );
}

function createClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createOptimisticMessage(
  tempId: number,
  senderId: number,
  receiverId: number,
  content: string,
  clientId: string
): ChatMessage {
  return {
    id: tempId,
    content,
    senderId,
    receiverId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  };
}

function createOptimisticRoomMessage(
  tempId: number,
  sender: User,
  chatRoomId: number,
  content: string,
  clientId: string
): ChatMessage {
  return {
    id: tempId,
    content,
    senderId: sender.id,
    senderUsername: sender.username,
    senderFullName: getUserDisplayName(sender),
    receiverId: null,
    chatRoomId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  };
}

function markOptimisticMessageSending(messages: ChatMessage[], clientId: string) {
  return messages.map((message) =>
    message.clientId === clientId ? { ...message, deliveryStatus: 'sending' as const } : message
  );
}

function markOptimisticMessageFailed(messages: ChatMessage[], clientId: string) {
  return messages.map((message) =>
    message.clientId === clientId && message.deliveryStatus === 'sending'
      ? { ...message, deliveryStatus: 'failed' as const }
      : message
  );
}

function getDeliveryStatusLabel(message: ChatMessage) {
  if (message.deliveryStatus === 'sending') {
    return 'Sending';
  }

  if (message.deliveryStatus === 'failed') {
    return 'Failed';
  }

  return message.read ? 'Read' : 'Sent';
}

function getBrowserAwareConnectionStatus(status: ConnectionStatus): ConnectionStatus {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }

  return status;
}

function getUserDisplayName(user: User | null) {
  return user?.fullName?.trim() || user?.username || '';
}

function getUserInitial(user: User | null) {
  return getUserDisplayName(user).charAt(0).toUpperCase() || '?';
}

function getAvatarUrl(avatar?: string | null) {
  const trimmedAvatar = avatar?.trim();
  if (!trimmedAvatar) {
    return '';
  }

  if (/^(https?:|blob:|data:)/i.test(trimmedAvatar)) {
    return trimmedAvatar;
  }

  const baseUrl = new URL(
    API_BASE_URL,
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  );
  const apiPath = baseUrl.pathname.replace(/\/$/, '');
  const assetPath = trimmedAvatar.startsWith('/') ? trimmedAvatar : `/${trimmedAvatar}`;
  const resolvedPath =
    apiPath && !assetPath.startsWith(`${apiPath}/`) ? `${apiPath}${assetPath}` : assetPath;

  return `${baseUrl.origin}${resolvedPath}`;
}

function renderUserAvatar(user: User | null, className = 'user-avatar') {
  const avatarUrl = getAvatarUrl(user?.avatar);

  return (
    <div className={className}>
      {avatarUrl ? <img src={avatarUrl} alt="" /> : getUserInitial(user)}
    </div>
  );
}

function shouldShowUsername(user: User) {
  return getUserDisplayName(user) !== user.username;
}

function getRoomInitial(room: ChatRoom) {
  return room.name.trim().charAt(0).toUpperCase();
}

function getRoomMemberSummary(room: ChatRoom, currentUserId?: number | null) {
  const otherMembers = room.participants.filter((participant) => participant.id !== currentUserId);
  const visibleNames = otherMembers.slice(0, 2).map(getUserDisplayName);
  const remainingCount = otherMembers.length - visibleNames.length;

  if (visibleNames.length === 0) {
    return 'Only you';
  }

  return remainingCount > 0
    ? `${visibleNames.join(', ')} +${remainingCount}`
    : visibleNames.join(', ');
}

function sortParticipantsForDetails(participants: User[]) {
  return [...participants].sort((left, right) => {
    if (left.online !== right.online) {
      return left.online ? -1 : 1;
    }

    return getUserDisplayName(left).localeCompare(getUserDisplayName(right));
  });
}

function shouldOpenConversationDetailsByDefault() {
  if (typeof window === 'undefined') {
    return true;
  }

  return !window.matchMedia('(max-width: 768px)').matches;
}

function getMessageSenderName(message: ChatMessage, selectedRoom: ChatRoom | null) {
  if (message.senderFullName?.trim()) {
    return message.senderFullName;
  }

  const participant = selectedRoom?.participants.find((user) => user.id === message.senderId);
  return participant ? getUserDisplayName(participant) : message.senderUsername ?? 'Unknown';
}

function canChatWithUser(user: User) {
  return user.friendshipStatus === 'accepted';
}

function getFriendshipStatusLabel(user: User) {
  switch (user.friendshipStatus) {
    case 'pending_incoming':
      return 'Request received';
    case 'pending_outgoing':
      return 'Pending';
    case 'declined':
    case 'none':
      return 'Not friends';
    case 'accepted':
    default:
      return user.online ? 'Online' : 'Offline';
  }
}

function getUserStatusClass(user: User) {
  return canChatWithUser(user) ? (user.online ? 'online' : 'offline') : 'relationship';
}

function getPrivateConversationUserId(message: Message, currentUserId: number | null) {
  if (currentUserId === null || message.chatRoomId) {
    return null;
  }

  if (message.senderId === currentUserId) {
    return message.receiverId ?? null;
  }

  return message.receiverId === currentUserId ? message.senderId : null;
}

function getTimestampValue(timestamp?: string) {
  if (!timestamp) {
    return 0;
  }

  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
}

function getRoomActivityTimestamp(room: ChatRoom) {
  return getTimestampValue(room.lastMessageAt) || getTimestampValue(room.createdAt);
}

function compareRoomsByChatActivity(firstRoom: ChatRoom, secondRoom: ChatRoom) {
  const activityDifference =
    getRoomActivityTimestamp(secondRoom) - getRoomActivityTimestamp(firstRoom);

  if (activityDifference !== 0) {
    return activityDifference;
  }

  return firstRoom.name.localeCompare(secondRoom.name);
}

function sortRoomsByChatActivity(rooms: ChatRoom[]) {
  return [...rooms].sort(compareRoomsByChatActivity);
}

function shouldUseMessageAsRoomPreview(room: ChatRoom, message: Message) {
  return getTimestampValue(message.timestamp) >= getTimestampValue(room.lastMessageAt);
}

function getMessageSenderDisplayName(message: Message) {
  return message.senderFullName?.trim() || message.senderUsername || 'Unknown';
}

function applyRoomPreviewToRoom(room: ChatRoom, message: Message) {
  if (message.chatRoomId !== room.id || !shouldUseMessageAsRoomPreview(room, message)) {
    return room;
  }

  return {
    ...room,
    lastMessageContent: message.content,
    lastMessageAt: message.timestamp,
    lastMessageSenderId: message.senderId,
    lastMessageSenderName: getMessageSenderDisplayName(message),
  };
}

function applyRoomPreviewToRooms(
  rooms: ChatRoom[],
  message: Message,
  currentUserId: number | null,
  selectedRoomId: number | null
) {
  if (!message.chatRoomId) {
    return rooms;
  }

  let didUpdate = false;
  const nextRooms = rooms.map((room) => {
    if (room.id !== message.chatRoomId) {
      return room;
    }

    const withPreview = applyRoomPreviewToRoom(room, message);
    const shouldIncrementUnread =
      message.senderId !== currentUserId && room.id !== selectedRoomId;
    const nextRoom = {
      ...withPreview,
      unreadCount: shouldIncrementUnread
        ? (withPreview.unreadCount ?? 0) + 1
        : withPreview.unreadCount ?? 0,
    };

    didUpdate ||= nextRoom !== room;
    return nextRoom;
  });

  return didUpdate ? sortRoomsByChatActivity(nextRooms) : rooms;
}

function shouldUseMessageAsPreview(user: User, message: Message) {
  return getTimestampValue(message.timestamp) >= getTimestampValue(user.lastMessageAt);
}

function applyConversationPreviewToUser(user: User, message: Message, currentUserId: number | null) {
  const conversationUserId = getPrivateConversationUserId(message, currentUserId);
  if (conversationUserId !== user.id || !shouldUseMessageAsPreview(user, message)) {
    return user;
  }

  return {
    ...user,
    lastMessageContent: message.content,
    lastMessageAt: message.timestamp,
    lastMessageSenderId: message.senderId,
  };
}

function compareUsersByChatActivity(firstUser: User, secondUser: User) {
  const activityDifference =
    getTimestampValue(secondUser.lastMessageAt) - getTimestampValue(firstUser.lastMessageAt);
  if (activityDifference !== 0) {
    return activityDifference;
  }

  return getUserDisplayName(firstUser).localeCompare(getUserDisplayName(secondUser));
}

function applyConversationPreviewToUsers(
  users: User[],
  message: Message,
  currentUserId: number | null,
  moveUpdatedUserToTop: boolean
) {
  const conversationUserId = getPrivateConversationUserId(message, currentUserId);
  if (conversationUserId === null) {
    return users;
  }

  let didUpdate = false;
  const nextUsers = users.map((user) => {
    const nextUser = applyConversationPreviewToUser(user, message, currentUserId);
    didUpdate ||= nextUser !== user;
    return nextUser;
  });

  if (!didUpdate) {
    return users;
  }

  return moveUpdatedUserToTop ? [...nextUsers].sort(compareUsersByChatActivity) : nextUsers;
}

function formatSidebarTime(timestamp?: string) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getConversationPreviewText(user: User, currentUserId: number | null) {
  const content = user.lastMessageContent?.trim();
  if (content) {
    return user.lastMessageSenderId === currentUserId ? `You: ${content}` : content;
  }

  const username = shouldShowUsername(user) ? ` @${user.username}` : '';
  return `${getFriendshipStatusLabel(user)}${username}`;
}

function getRoomPreviewText(room: ChatRoom, currentUserId: number | null) {
  const content = room.lastMessageContent?.trim();
  if (!content) {
    return getRoomMemberSummary(room, currentUserId);
  }

  if (room.lastMessageSenderId === currentUserId) {
    return `You: ${content}`;
  }

  const senderName = room.lastMessageSenderName?.trim();
  return senderName ? `${senderName}: ${content}` : content;
}

function hasPrivateConversation(user: User) {
  return Boolean(user.lastMessageAt || user.lastMessageContent?.trim() || (user.unreadCount ?? 0) > 0);
}

function matchesFriendSearch(user: User, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return (
    getUserDisplayName(user).toLowerCase().includes(normalizedQuery) ||
    user.username.toLowerCase().includes(normalizedQuery)
  );
}

function getLocalDateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDateKey(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return getLocalDateKeyFromDate(date);
}

function formatMessageDateDivider(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dateKey = getLocalDateKey(timestamp);

  if (dateKey === getLocalDateKeyFromDate(today)) {
    return 'Today';
  }

  if (dateKey === getLocalDateKeyFromDate(yesterday)) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function shouldGroupAdjacentMessages(firstMessage: ChatMessage | undefined, secondMessage: ChatMessage | undefined) {
  if (!firstMessage || !secondMessage || firstMessage.senderId !== secondMessage.senderId) {
    return false;
  }

  if (getLocalDateKey(firstMessage.timestamp) !== getLocalDateKey(secondMessage.timestamp)) {
    return false;
  }

  const firstTimestamp = getTimestampValue(firstMessage.timestamp);
  const secondTimestamp = getTimestampValue(secondMessage.timestamp);
  if (!firstTimestamp || !secondTimestamp) {
    return false;
  }

  return secondTimestamp - firstTimestamp <= MESSAGE_GROUP_THRESHOLD_MS;
}

function buildMessageListItems(
  messages: ChatMessage[],
  selectedRoom: ChatRoom | null,
  currentUserId: number | null
): MessageListItem[] {
  const items: MessageListItem[] = [];
  let previousDateKey = '';

  messages.forEach((message, index) => {
    const dateKey = getLocalDateKey(message.timestamp);
    if (dateKey !== previousDateKey) {
      items.push({
        type: 'date',
        key: `date-${dateKey}-${message.id}`,
        label: formatMessageDateDivider(message.timestamp),
      });
      previousDateKey = dateKey;
    }

    const previousMessage = messages[index - 1];
    const nextMessage = messages[index + 1];
    const groupedWithPrevious = shouldGroupAdjacentMessages(previousMessage, message);
    const groupedWithNext = shouldGroupAdjacentMessages(message, nextMessage);

    items.push({
      type: 'message',
      key: `${message.clientId ?? message.id}`,
      message,
      groupedWithPrevious,
      groupedWithNext,
      showSender: Boolean(
        selectedRoom &&
          message.senderId !== currentUserId &&
          !groupedWithPrevious
      ),
    });
  });

  return items;
}

export default function ChatPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [roomsError, setRoomsError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [friendRequestsError, setFriendRequestsError] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [friendRequestsLoading, setFriendRequestsLoading] = useState(true);
  const [mainView, setMainView] = useState<MainView>('chat');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<Friendship[]>([]);
  const [friendSummary, setFriendSummary] = useState<FriendshipSummary>({
    incomingCount: 0,
    outgoingCount: 0,
  });
  const [friendActionKeys, setFriendActionKeys] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<number[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [profileFullName, setProfileFullName] = useState('');
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(shouldOpenConversationDetailsByDefault);
  const currentUserIdRef = useRef<number | null>(null);
  const selectedUserIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const userSearchQueryRef = useRef('');
  const optimisticMessageIdRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const hasLoadedInitialUsersRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const selectedUserId = selectedUser?.id ?? null;
  const selectedRoomId = selectedRoom?.id ?? null;

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: 'end',
    });
  }, []);

  const getNextOptimisticMessageId = () => {
    optimisticMessageIdRef.current -= 1;
    return optimisticMessageIdRef.current;
  };

  const loadUsers = useCallback(async (options: LoadOptions = {}) => {
    const search = (options.search ?? userSearchQueryRef.current).trim();
    const isCurrentSearch = () => userSearchQueryRef.current.trim() === search;
    const usersEndpoint = search ? '/friends/search' : '/friends';

    if (!options.silent) {
      setUsersLoading(true);
    }
    setUsersError('');

    try {
      const [usersResponse, unreadCountsResponse] = await Promise.all([
        apiClient.get<User[]>(usersEndpoint, {
          params: search ? { username: search } : undefined,
        }),
        apiClient.get<UnreadCount[]>('/messages/unread-counts'),
      ]);
      if (!isCurrentSearch()) {
        return;
      }

      const nextUsers = mergeUnreadCounts(usersResponse.data, unreadCountsResponse.data);
      setUsers(nextUsers);
      if (!search) {
        setFriends(nextUsers);
      }

      const selectedUserIdForUpdate = selectedUserIdRef.current;
      if (selectedUserIdForUpdate !== null) {
        const updatedSelectedUser = nextUsers.find((user) => user.id === selectedUserIdForUpdate);
        if (updatedSelectedUser && canChatWithUser(updatedSelectedUser)) {
          setSelectedUser(updatedSelectedUser);
        } else if (!search || updatedSelectedUser) {
          selectedUserIdRef.current = null;
          setSelectedUser(null);
          setMessages([]);
          setMessageInput('');
        }
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      if (!options.silent && isCurrentSearch()) {
        setUsersError('Unable to load friends.');
      }
    } finally {
      if (!options.silent && isCurrentSearch()) {
        setUsersLoading(false);
      }
    }
  }, []);

  const loadIncomingFriendRequests = useCallback(async (options: LoadOptions = {}) => {
    if (!options.silent) {
      setFriendRequestsLoading(true);
    }
    setFriendRequestsError('');

    try {
      const response = await apiClient.get<Friendship[]>('/friend-requests/incoming');
      setIncomingFriendRequests(response.data);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
      if (!options.silent) {
        setFriendRequestsError('Unable to load requests.');
      }
    } finally {
      if (!options.silent) {
        setFriendRequestsLoading(false);
      }
    }
  }, []);

  const loadFriendSummary = useCallback(async (options: LoadOptions = {}) => {
    try {
      const response = await apiClient.get<FriendshipSummary>('/friend-requests/summary');
      setFriendSummary(response.data);
    } catch (error) {
      console.error('Failed to load friend request summary:', error);
      if (!options.silent) {
        setFriendSummary({ incomingCount: 0, outgoingCount: 0 });
      }
    }
  }, []);

  const loadRooms = useCallback(async (options: LoadOptions = {}) => {
    if (!options.silent) {
      setRoomsLoading(true);
    }
    setRoomsError('');

    try {
      const response = await apiClient.get<ChatRoom[]>('/rooms');
      const nextRooms = sortRoomsByChatActivity(response.data);
      setRooms(nextRooms);
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom
          ? nextRooms.find((room) => room.id === currentSelectedRoom.id) ?? currentSelectedRoom
          : null
      );
    } catch (error) {
      console.error('Failed to load rooms:', error);
      if (!options.silent) {
        setRoomsError('Unable to load groups.');
      }
    } finally {
      if (!options.silent) {
        setRoomsLoading(false);
      }
    }
  }, []);

  const loadMessages = useCallback(async (userId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<Message[]>(`/messages/${userId}`);
      if (selectedUserIdRef.current === userId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(currentMessages, response.data)
        );
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (!options.silent && selectedUserIdRef.current === userId) {
        setMessagesError('Unable to load messages.');
      }
    } finally {
      if (!options.silent && selectedUserIdRef.current === userId) {
        setMessagesLoading(false);
      }
    }
  }, []);

  const loadRoomMessages = useCallback(async (roomId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<Message[]>(`/rooms/${roomId}/messages`);
      if (selectedRoomIdRef.current === roomId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(currentMessages, response.data)
        );
      }
    } catch (error) {
      console.error('Failed to load room messages:', error);
      if (!options.silent && selectedRoomIdRef.current === roomId) {
        setMessagesError('Unable to load group messages.');
      }
    } finally {
      if (!options.silent && selectedRoomIdRef.current === roomId) {
        setMessagesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      navigate(ROUTES.HOME, { replace: true });
      return;
    }

    try {
      const parsedUser = JSON.parse(user) as User;
      setCurrentUser({ ...parsedUser, online: false });
      currentUserIdRef.current = parsedUser.id;
    } catch (error) {
      console.error('Failed to read current user:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [navigate]);

  useEffect(() => () => {
    if (profileAvatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(profileAvatarPreview);
    }
  }, [profileAvatarPreview]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    userSearchQueryRef.current = userSearchQuery;
    const isInitialLoad = !hasLoadedInitialUsersRef.current;
    const timeout = setTimeout(() => {
      hasLoadedInitialUsersRef.current = true;
      void loadUsers({ search: userSearchQuery });
    }, isInitialLoad ? 0 : USER_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [currentUser?.id, loadUsers, userSearchQuery]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    void loadRooms();
  }, [currentUser?.id, loadRooms]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    void loadIncomingFriendRequests();
    void loadFriendSummary();
  }, [currentUser?.id, loadFriendSummary, loadIncomingFriendRequests]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    currentUserIdRef.current = currentUser.id;
    let active = true;

    wsService
      .connect(
        (incomingMessage) => {
          if (!active) {
            return;
          }

          setMessages((currentMessages) => {
            if (
              !isActiveConversationMessage(
                incomingMessage,
                currentUserIdRef.current,
                selectedUserIdRef.current,
                selectedRoomIdRef.current
              )
            ) {
              return currentMessages;
            }

            return appendOrReconcileMessage(currentMessages, incomingMessage);
          });

          if (incomingMessage.clientId) {
            clearOptimisticSendTimeout(incomingMessage.clientId);
          }

          if (incomingMessage.chatRoomId) {
            setRooms((currentRooms) =>
              applyRoomPreviewToRooms(
                currentRooms,
                incomingMessage,
                currentUserIdRef.current,
                selectedRoomIdRef.current
              )
            );
            setSelectedRoom((currentSelectedRoom) => {
              if (!currentSelectedRoom || currentSelectedRoom.id !== incomingMessage.chatRoomId) {
                return currentSelectedRoom;
              }

              return {
                ...applyRoomPreviewToRoom(currentSelectedRoom, incomingMessage),
                unreadCount: 0,
              };
            });

            if (
              incomingMessage.senderId !== currentUserIdRef.current &&
              incomingMessage.chatRoomId === selectedRoomIdRef.current
            ) {
              void markRoomAsRead(incomingMessage.chatRoomId);
            }

            return;
          }

          setUsers((currentUsers) =>
            applyConversationPreviewToUsers(
              currentUsers,
              incomingMessage,
              currentUserIdRef.current,
              !userSearchQueryRef.current.trim()
            )
          );
          setFriends((currentFriends) =>
            applyConversationPreviewToUsers(
              currentFriends,
              incomingMessage,
              currentUserIdRef.current,
              true
            )
          );
          setSelectedUser((currentSelectedUser) =>
            currentSelectedUser
              ? applyConversationPreviewToUser(
                  currentSelectedUser,
                  incomingMessage,
                  currentUserIdRef.current
                )
              : null
          );

          if (
            incomingMessage.senderId !== currentUserIdRef.current &&
            incomingMessage.senderId === selectedUserIdRef.current
          ) {
            markConversationAsRead(incomingMessage.senderId);
            return;
          }

          if (incomingMessage.senderId !== currentUserIdRef.current) {
            setUsers((currentUsers) => incrementUnreadCount(currentUsers, incomingMessage.senderId));
            setFriends((currentFriends) => incrementUnreadCount(currentFriends, incomingMessage.senderId));
          }
        },
        (presence) => {
          if (!active) {
            return;
          }

          setUsers((currentUsers) =>
            currentUsers.map((user) => applyPresenceToUser(user, presence))
          );
          setFriends((currentFriends) =>
            currentFriends.map((user) => applyPresenceToUser(user, presence))
          );
          setSelectedUser((currentSelectedUser) =>
            currentSelectedUser ? applyPresenceToUser(currentSelectedUser, presence) : null
          );
          if (presence.userId === currentUserIdRef.current) {
            setCurrentUser((currentAccount) =>
              currentAccount ? applyPresenceToUser(currentAccount, presence) : null
            );
          }
        },
        (typing) => {
          if (!active || !isTypingFromSelectedUser(typing, selectedUserIdRef.current)) {
            return;
          }

          if (typing.typing) {
            showRemoteTyping(typing.senderId);
          } else {
            hideRemoteTyping();
          }
        },
        (receipt) => {
          if (!active) {
            return;
          }

          setMessages((currentMessages) => applyReadReceipt(currentMessages, receipt));
          if (receipt.readerId === currentUserIdRef.current) {
            setUsers((currentUsers) => resetUnreadCount(currentUsers, receipt.senderId));
            setFriends((currentFriends) => resetUnreadCount(currentFriends, receipt.senderId));
          }
        },
        (status) => {
          if (!active) {
            return;
          }

          const browserAwareStatus = getBrowserAwareConnectionStatus(status);
          const isOnline = browserAwareStatus === 'connected';
          setCurrentUser((currentAccount) =>
            currentAccount ? { ...currentAccount, online: isOnline } : null
          );

          if (!isOnline) {
            return;
          }

          if (!hasConnectedRef.current) {
            hasConnectedRef.current = true;
            return;
          }

          const selectedUserIdForResync = selectedUserIdRef.current;
          const selectedRoomIdForResync = selectedRoomIdRef.current;
          Promise.all([
            loadUsers({ silent: true }),
            loadRooms({ silent: true }),
            loadIncomingFriendRequests({ silent: true }),
            loadFriendSummary({ silent: true }),
            selectedUserIdForResync !== null
              ? loadMessages(selectedUserIdForResync, { silent: true })
            : selectedRoomIdForResync !== null
              ? loadRoomMessages(selectedRoomIdForResync, { silent: true })
              : Promise.resolve(),
          ])
            .then(() => {
              if (
                selectedUserIdForResync !== null &&
                selectedUserIdRef.current === selectedUserIdForResync
              ) {
                void markConversationAsRead(selectedUserIdForResync);
              } else if (
                selectedRoomIdForResync !== null &&
                selectedRoomIdRef.current === selectedRoomIdForResync
              ) {
                void markRoomAsRead(selectedRoomIdForResync);
              }
            })
            .catch((error) => {
              console.error('Failed to resync chat state:', error);
            });
        },
        (room) => {
          if (!active) {
            return;
          }

          setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
          setSelectedRoom((currentSelectedRoom) =>
            currentSelectedRoom?.id === room.id ? room : currentSelectedRoom
          );
        },
        () => {
          if (!active) {
            return;
          }

          void Promise.all([
            loadUsers({ silent: true }),
            loadIncomingFriendRequests({ silent: true }),
            loadFriendSummary({ silent: true }),
          ]);
        }
      )
      .catch((error) => {
        console.error('Failed to connect WebSocket:', error);
      });

    return () => {
      active = false;
      hasConnectedRef.current = false;
      clearTypingTimeout();
      clearRemoteTypingTimeout();
      clearOptimisticSendTimeouts();
      wsService.disconnect();
    };
  }, [
    currentUser?.id,
    loadFriendSummary,
    loadIncomingFriendRequests,
    loadMessages,
    loadRoomMessages,
    loadRooms,
    loadUsers,
  ]);

  useEffect(() => {
    if ((selectedUserId === null && selectedRoomId === null) || messagesLoading) {
      return;
    }

    scrollToLatestMessage('smooth');
  }, [
    messages.length,
    messagesLoading,
    scrollToLatestMessage,
    selectedRoomId,
    selectedUserId,
    typingUserId,
  ]);

  const clearTypingTimeout = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const clearRemoteTypingTimeout = () => {
    if (remoteTypingTimeoutRef.current) {
      clearTimeout(remoteTypingTimeoutRef.current);
      remoteTypingTimeoutRef.current = null;
    }
  };

  const clearOptimisticSendTimeout = (clientId: string) => {
    const timeout = sendTimeoutsRef.current.get(clientId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    sendTimeoutsRef.current.delete(clientId);
  };

  const clearOptimisticSendTimeouts = () => {
    sendTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    sendTimeoutsRef.current.clear();
  };

  const scheduleOptimisticSendTimeout = (clientId: string) => {
    clearOptimisticSendTimeout(clientId);

    const timeout = setTimeout(() => {
      sendTimeoutsRef.current.delete(clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, clientId));
    }, OPTIMISTIC_SEND_TIMEOUT_MS);

    sendTimeoutsRef.current.set(clientId, timeout);
  };

  const showRemoteTyping = (senderId: number) => {
    setTypingUserId(senderId);
    clearRemoteTypingTimeout();
    remoteTypingTimeoutRef.current = setTimeout(() => {
      setTypingUserId(null);
      remoteTypingTimeoutRef.current = null;
    }, REMOTE_TYPING_VISIBLE_MS);
  };

  const hideRemoteTyping = () => {
    clearRemoteTypingTimeout();
    setTypingUserId(null);
  };

  const publishTyping = (receiverId: number, typing: boolean) => {
    wsService.sendMessage(TYPING_DESTINATION, {
      receiverId,
      typing,
    });
  };

  const stopTyping = (receiverId: number) => {
    clearTypingTimeout();
    publishTyping(receiverId, false);
  };

  const sendOptimisticMessage = async (payload: SendMessagePayload) => {
    const sentRealtime = wsService.sendMessage(PRIVATE_MESSAGE_DESTINATION, payload);
    if (sentRealtime) {
      scheduleOptimisticSendTimeout(payload.clientId);
      return;
    }

    try {
      const response = await apiClient.post<Message>('/messages', payload);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => appendOrReconcileMessage(currentMessages, response.data));
      setUsers((currentUsers) =>
        applyConversationPreviewToUsers(
          currentUsers,
          response.data,
          currentUserIdRef.current,
          !userSearchQueryRef.current.trim()
        )
      );
      setFriends((currentFriends) =>
        applyConversationPreviewToUsers(currentFriends, response.data, currentUserIdRef.current, true)
      );
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser
          ? applyConversationPreviewToUser(currentSelectedUser, response.data, currentUserIdRef.current)
          : null
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, payload.clientId));
    }
  };

  const sendOptimisticRoomMessage = async (roomId: number, payload: SendRoomMessagePayload) => {
    const sentRealtime = wsService.sendMessage(
      `${GROUP_MESSAGE_DESTINATION_PREFIX}/${roomId}/send`,
      payload
    );
    if (sentRealtime) {
      scheduleOptimisticSendTimeout(payload.clientId);
      return;
    }

    try {
      const response = await apiClient.post<Message>(`/rooms/${roomId}/messages`, payload);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => appendOrReconcileMessage(currentMessages, response.data));
      setRooms((currentRooms) =>
        applyRoomPreviewToRooms(
          currentRooms,
          response.data,
          currentUserIdRef.current,
          selectedRoomIdRef.current
        )
      );
      setSelectedRoom((currentSelectedRoom) => {
        if (!currentSelectedRoom || currentSelectedRoom.id !== response.data.chatRoomId) {
          return currentSelectedRoom;
        }

        return {
          ...applyRoomPreviewToRoom(currentSelectedRoom, response.data),
          unreadCount: 0,
        };
      });
    } catch (error) {
      console.error('Failed to send group message:', error);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, payload.clientId));
    }
  };

  const markConversationAsRead = async (senderId: number) => {
    setUsers((currentUsers) => resetUnreadCount(currentUsers, senderId));
    setFriends((currentFriends) => resetUnreadCount(currentFriends, senderId));

    const sentRealtime = wsService.sendMessage(READ_RECEIPT_DESTINATION, {
      senderId,
    });

    if (!sentRealtime) {
      try {
        const response = await apiClient.patch<ReadReceiptEvent>(`/messages/${senderId}/read`);
        setMessages((currentMessages) => applyReadReceipt(currentMessages, response.data));
      } catch (error) {
        console.error('Failed to mark conversation as read:', error);
      }
    }
  };

  const markRoomAsRead = async (roomId: number) => {
    setRooms((currentRooms) => resetRoomUnreadCount(currentRooms, roomId));
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom?.id === roomId ? { ...currentSelectedRoom, unreadCount: 0 } : currentSelectedRoom
    );

    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${roomId}/read`);
      setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, response.data));
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom?.id === roomId ? response.data : currentSelectedRoom
      );
    } catch (error) {
      console.error('Failed to mark group as read:', error);
    }
  };

  const setFriendActionPending = (key: string, pending: boolean) => {
    setFriendActionKeys((currentKeys) =>
      pending
        ? [...new Set([...currentKeys, key])]
        : currentKeys.filter((currentKey) => currentKey !== key)
    );
  };

  const refreshFriendshipState = async () => {
    await Promise.all([
      loadUsers({ silent: true }),
      loadIncomingFriendRequests({ silent: true }),
      loadFriendSummary({ silent: true }),
    ]);
  };

  const handleOpenRequestsPanel = () => {
    setMainView('requests');
    setProfileMenuOpen(false);
    void Promise.all([
      loadIncomingFriendRequests({ silent: incomingFriendRequests.length > 0 }),
      loadFriendSummary({ silent: true }),
    ]);
  };

  const handleSendFriendRequest = async (user: User) => {
    const actionKey = `send-${user.id}`;
    setFriendActionPending(actionKey, true);
    setUsersError('');

    try {
      await apiClient.post<Friendship>('/friend-requests', {
        receiverId: user.id,
      });
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to send friend request:', error);
      setUsersError('Unable to send friend request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleAcceptFriendRequest = async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true);
    setFriendRequestsError('');

    try {
      await apiClient.patch<Friendship>(`/friend-requests/${requestId}/accept`);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      setFriendRequestsError('Unable to accept request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleDeclineFriendRequest = async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true);
    setFriendRequestsError('');

    try {
      await apiClient.patch<Friendship>(`/friend-requests/${requestId}/decline`);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      setFriendRequestsError('Unable to decline request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleCancelFriendRequest = async (user: User) => {
    if (!user.friendshipId) {
      return;
    }

    const actionKey = `cancel-${user.id}`;
    setFriendActionPending(actionKey, true);
    setUsersError('');

    try {
      await apiClient.delete(`/friend-requests/${user.friendshipId}`);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to cancel friend request:', error);
      setUsersError('Unable to cancel friend request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleUserSelect = (user: User) => {
    if (!canChatWithUser(user)) {
      return;
    }

    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    setSelectedRoom(null);
    selectedRoomIdRef.current = null;
    setSelectedUser(user);
    selectedUserIdRef.current = user.id;
    setMainView('chat');
    setProfileMenuOpen(false);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();
    void loadMessages(user.id);
    void markConversationAsRead(user.id);
  };

  const handleRoomSelect = (room: ChatRoom) => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    setSelectedUser(null);
    selectedUserIdRef.current = null;
    setSelectedRoom(room);
    selectedRoomIdRef.current = room.id;
    setMainView('chat');
    setProfileMenuOpen(false);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();
    void loadRoomMessages(room.id);
    void markRoomAsRead(room.id);
  };

  const handleUserSearchChange = (value: string) => {
    userSearchQueryRef.current = value;
    setUserSearchQuery(value);
    setUsersError('');
  };

  const handleClearUserSearch = () => {
    userSearchQueryRef.current = '';
    setUserSearchQuery('');
    setUsersError('');
  };

  const handleFriendSearchChange = (value: string) => {
    setFriendSearchQuery(value);
  };

  const handleClearFriendSearch = () => {
    setFriendSearchQuery('');
  };

  const handleOpenFriendsPanel = () => {
    setMainView('friends');
    setProfileMenuOpen(false);

    if (userSearchQueryRef.current) {
      handleClearUserSearch();
    }

    void loadUsers({ silent: true, search: '' });
  };

  const handleToggleProfileMenu = () => {
    setProfileMenuOpen((currentOpen) => !currentOpen);
  };

  const handleToggleConversationDetails = () => {
    setDetailsOpen((currentOpen) => !currentOpen);
    setProfileMenuOpen(false);
  };

  const handleCloseConversationDetails = () => {
    setDetailsOpen(false);
  };

  const handleOpenCreateGroup = () => {
    setMainView('chat');
    setProfileMenuOpen(false);
    setCreateGroupOpen(true);
    setGroupError('');
  };

  const handleCloseCreateGroup = () => {
    if (groupCreating) {
      return;
    }

    setCreateGroupOpen(false);
    setGroupName('');
    setSelectedGroupMemberIds([]);
    setGroupError('');
  };

  const handleToggleGroupMember = (userId: number) => {
    setGroupError('');
    setSelectedGroupMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  };

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      return;
    }

    if (selectedGroupMemberIds.length < MIN_GROUP_INVITED_MEMBERS) {
      setGroupError(`Select at least ${MIN_GROUP_INVITED_MEMBERS} friends to create a group.`);
      return;
    }

    setGroupCreating(true);
    setGroupError('');

    try {
      const response = await apiClient.post<ChatRoom>('/rooms', {
        name,
        participantIds: selectedGroupMemberIds,
      });
      const room = response.data;
      if (selectedUserIdRef.current !== null) {
        stopTyping(selectedUserIdRef.current);
      }
      setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
      setSelectedUser(null);
      selectedUserIdRef.current = null;
      setSelectedRoom(room);
      selectedRoomIdRef.current = room.id;
      setDetailsOpen(shouldOpenConversationDetailsByDefault());
      setMessages([]);
      setMessageInput('');
      setCreateGroupOpen(false);
      setGroupName('');
      setSelectedGroupMemberIds([]);
    } catch (error) {
      console.error('Failed to create group:', error);
      setGroupError('Unable to create group.');
    } finally {
      setGroupCreating(false);
    }
  };

  const handleMessageInputChange = (value: string) => {
    setMessageInput(value);
    if (!selectedUser) {
      return;
    }

    if (!value.trim()) {
      stopTyping(selectedUser.id);
      return;
    }

    publishTyping(selectedUser.id, true);
    clearTypingTimeout();
    typingTimeoutRef.current = setTimeout(() => {
      publishTyping(selectedUser.id, false);
      typingTimeoutRef.current = null;
    }, STOP_TYPING_DELAY_MS);
  };

  const handleMessageInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = messageInput.trim();
    if (!content || !currentUser || (!selectedUser && !selectedRoom)) return;

    const clientId = createClientId();
    setMessagesError('');
    setMessageInput('');

    if (selectedUser) {
      const optimisticMessage = createOptimisticMessage(
        getNextOptimisticMessageId(),
        currentUser.id,
        selectedUser.id,
        content,
        clientId
      );
      const payload = {
        receiverId: selectedUser.id,
        content,
        clientId,
      };

      stopTyping(selectedUser.id);
      setMessages((currentMessages) => appendOptimisticMessage(currentMessages, optimisticMessage));
      setUsers((currentUsers) =>
        applyConversationPreviewToUsers(
          currentUsers,
          optimisticMessage,
          currentUser.id,
          !userSearchQueryRef.current.trim()
        )
      );
      setFriends((currentFriends) =>
        applyConversationPreviewToUsers(currentFriends, optimisticMessage, currentUser.id, true)
      );
      setSelectedUser((currentSelectedUser) =>
        currentSelectedUser
          ? applyConversationPreviewToUser(currentSelectedUser, optimisticMessage, currentUser.id)
          : null
      );
      void sendOptimisticMessage(payload);
      return;
    }

    if (selectedRoom) {
      const optimisticMessage = createOptimisticRoomMessage(
        getNextOptimisticMessageId(),
        currentUser,
        selectedRoom.id,
        content,
        clientId
      );
      const payload = {
        content,
        clientId,
      };

      setMessages((currentMessages) => appendOptimisticMessage(currentMessages, optimisticMessage));
      setRooms((currentRooms) =>
        applyRoomPreviewToRooms(
          currentRooms,
          optimisticMessage,
          currentUser.id,
          selectedRoom.id
        )
      );
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom?.id === selectedRoom.id
          ? {
              ...applyRoomPreviewToRoom(currentSelectedRoom, optimisticMessage),
              unreadCount: 0,
            }
          : currentSelectedRoom
      );
      void sendOptimisticRoomMessage(selectedRoom.id, payload);
    }
  };

  const handleRetryMessage = (message: ChatMessage) => {
    const clientId = message.clientId;
    if (!clientId) {
      return;
    }

    if (message.chatRoomId) {
      const payload = {
        content: message.content,
        clientId,
      };

      setMessages((currentMessages) => markOptimisticMessageSending(currentMessages, clientId));
      void sendOptimisticRoomMessage(message.chatRoomId, payload);
      return;
    }

    if (!message.receiverId) {
      return;
    }

    const payload = {
      receiverId: message.receiverId,
      content: message.content,
      clientId,
    };

    setMessages((currentMessages) => markOptimisticMessageSending(currentMessages, clientId));
    void sendOptimisticMessage(payload);
  };

  const applyUpdatedCurrentUserProfile = (updatedUser: User) => {
    const nextCurrentUser = currentUser
      ? { ...applyProfileToUser(currentUser, updatedUser), online: currentUser.online }
      : updatedUser;

    setCurrentUser(nextCurrentUser);
    currentUserIdRef.current = nextCurrentUser.id;
    localStorage.setItem('user', JSON.stringify(nextCurrentUser));
    setUsers((currentUsers) =>
      currentUsers.map((user) => applyProfileToUser(user, nextCurrentUser))
    );
    setFriends((currentFriends) =>
      currentFriends.map((friend) => applyProfileToUser(friend, nextCurrentUser))
    );
    setSelectedUser((currentSelectedUser) =>
      currentSelectedUser ? applyProfileToUser(currentSelectedUser, nextCurrentUser) : null
    );
    setRooms((currentRooms) =>
      currentRooms.map((room) => applyProfileToRoom(room, nextCurrentUser))
    );
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom ? applyProfileToRoom(currentSelectedRoom, nextCurrentUser) : null
    );
  };

  const handleOpenProfileEditor = () => {
    setProfileFullName(currentUser?.fullName ?? '');
    setProfileAvatarFile(null);
    setProfileAvatarPreview(getAvatarUrl(currentUser?.avatar));
    setProfileError('');
    setProfileMenuOpen(false);
    setProfileEditorOpen(true);
  };

  const handleCloseProfileEditor = () => {
    if (profileSaving) {
      return;
    }

    setProfileEditorOpen(false);
    setProfileAvatarFile(null);
    setProfileAvatarPreview('');
    setProfileError('');
  };

  const handleProfileAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      setProfileAvatarFile(null);
      setProfileError('Choose a JPG, PNG, GIF, or WebP image.');
      event.currentTarget.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setProfileAvatarFile(null);
      setProfileError(`Avatar must be ${MAX_AVATAR_SIZE_MB}MB or smaller.`);
      event.currentTarget.value = '';
      return;
    }

    setProfileAvatarFile(file);
    setProfileAvatarPreview(URL.createObjectURL(file));
    setProfileError('');
  };

  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const fullName = profileFullName.trim();

    if (!fullName) {
      setProfileError('Full name is required.');
      return;
    }

    const formData = new FormData();
    formData.append('fullName', fullName);
    if (profileAvatarFile) {
      formData.append('avatar', profileAvatarFile);
    }

    setProfileSaving(true);
    setProfileError('');

    try {
      const response = await apiClient.patch<User>('/users/me', formData);
      applyUpdatedCurrentUserProfile(response.data);
      setProfileEditorOpen(false);
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
    } catch (error) {
      console.error('Failed to update profile:', error);
      setProfileError('Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLogout = () => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    wsService.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate(ROUTES.HOME, { replace: true });
  };

  const currentUserDisplayName = getUserDisplayName(currentUser) || 'Profile';
  const currentUserOnline = Boolean(currentUser?.online);
  const normalizedUserSearchQuery = userSearchQuery.trim();
  const normalizedFriendSearchQuery = friendSearchQuery.trim();
  const hasUserSearch = Boolean(normalizedUserSearchQuery);
  const conversationUsers = users.filter(hasPrivateConversation);
  const filteredFriends = friends.filter((friend) =>
    matchesFriendSearch(friend, normalizedFriendSearchQuery)
  );
  const friendRequestBadgeCount = friendSummary.incomingCount;
  const usersEmptyMessage = normalizedUserSearchQuery
    ? `No username matches "${normalizedUserSearchQuery}".`
    : 'No friends yet. Search username to add friends.';
  const selectedConversationName = selectedRoom
    ? selectedRoom.name
    : selectedUser
      ? getUserDisplayName(selectedUser)
      : '';
  const selectedConversationOpen = Boolean(selectedUser || selectedRoom);
  const selectedInvitedMemberCount = selectedGroupMemberIds.length;
  const hasMinimumInvitedMembers = selectedInvitedMemberCount >= MIN_GROUP_INVITED_MEMBERS;
  const groupMemberRequirementText = hasMinimumInvitedMembers
    ? `${selectedInvitedMemberCount + 1} members total`
    : `${selectedInvitedMemberCount} of ${MIN_GROUP_INVITED_MEMBERS} friends selected`;
  const canCreateGroup = Boolean(groupName.trim()) && hasMinimumInvitedMembers && !groupCreating;
  const sidebarBusy = hasUserSearch ? usersLoading : usersLoading || roomsLoading;
  const messageListItems = buildMessageListItems(messages, selectedRoom, currentUser?.id ?? null);

  const renderFriendshipAction = (user: User) => {
    if (!hasUserSearch) {
      return null;
    }

    switch (user.friendshipStatus) {
      case 'pending_incoming': {
        const requestId = user.friendshipId;
        return requestId ? (
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`accept-user-${user.id}`)}
            onClick={() => void handleAcceptFriendRequest(requestId, `accept-user-${user.id}`)}
          >
            Accept
          </button>
        ) : null;
      }
      case 'pending_outgoing':
        return (
          <div className="friend-actions">
            <span className="friend-status-pill">Pending</span>
            <button
              type="button"
              className="friend-action-btn secondary"
              disabled={!user.friendshipId || friendActionKeys.includes(`cancel-${user.id}`)}
              onClick={() => void handleCancelFriendRequest(user)}
            >
              Cancel
            </button>
          </div>
        );
      case 'none':
      case 'declined':
      case undefined:
        return (
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`send-${user.id}`)}
            onClick={() => void handleSendFriendRequest(user)}
          >
            Add
          </button>
        );
      case 'accepted':
      default:
        return <span className="friend-status-pill accepted">Friend</span>;
    }
  };

  const renderUserIdentity = (user: User, showConversationPreview = false) => {
    const sidebarTime = showConversationPreview ? formatSidebarTime(user.lastMessageAt) : '';

    return (
      <>
        {renderUserAvatar(user)}
        <div className="user-info">
          <div className="user-title-row">
            <div className="user-name">{getUserDisplayName(user)}</div>
            {sidebarTime ? <span className="user-time">{sidebarTime}</span> : null}
          </div>
          {showConversationPreview ? (
            <div className="user-preview-row">
              <span className="user-preview">
                {getConversationPreviewText(user, currentUser?.id ?? null)}
              </span>
            </div>
          ) : (
            <div className="user-meta">
              <span className={`user-status ${getUserStatusClass(user)}`}>
                {getFriendshipStatusLabel(user)}
              </span>
              {shouldShowUsername(user) ? (
                <span className="user-username">@{user.username}</span>
              ) : null}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderUserItem = (user: User) => {
    const unreadCount = user.unreadCount ?? 0;
    const showConversationPreview = !hasUserSearch && canChatWithUser(user);

    if (canChatWithUser(user) && !hasUserSearch) {
      return (
        <button
          type="button"
          key={user.id}
          className={`user-item ${selectedUser?.id === user.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`}
          onClick={() => handleUserSelect(user)}
        >
          {renderUserIdentity(user, showConversationPreview)}
          {hasUserSearch ? renderFriendshipAction(user) : null}
          {unreadCount > 0 ? (
            <div className="unread-badge">{unreadCount}</div>
          ) : null}
        </button>
      );
    }

    return (
      <div key={user.id} className="user-item relationship-item">
        {renderUserIdentity(user)}
        {renderFriendshipAction(user)}
      </div>
    );
  };

  const renderRoomItem = (room: ChatRoom) => {
    const unreadCount = room.unreadCount ?? 0;
    const sidebarTime = formatSidebarTime(room.lastMessageAt);

    return (
      <button
        type="button"
        key={`room-${room.id}`}
        className={`user-item room-item ${selectedRoom?.id === room.id ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`}
        onClick={() => handleRoomSelect(room)}
      >
        <div className="user-avatar room-avatar">
          {getRoomInitial(room)}
        </div>
        <div className="user-info">
          <div className="user-title-row">
            <div className="user-name">{room.name}</div>
            {sidebarTime ? <span className="user-time">{sidebarTime}</span> : null}
          </div>
          <div className="user-preview-row">
            <span className="user-preview">
              {getRoomPreviewText(room, currentUser?.id ?? null)}
            </span>
          </div>
        </div>
        {unreadCount > 0 ? (
          <div className="unread-badge">{unreadCount}</div>
        ) : null}
      </button>
    );
  };

  const renderSidebarSkeletons = () =>
    USER_SKELETON_KEYS.map((key) => (
      <div key={key} className="user-item user-item-skeleton" aria-hidden="true">
        <div className="skeleton-avatar" />
        <div className="skeleton-user-info">
          <div className="skeleton-line name" />
          <div className="skeleton-line status" />
        </div>
      </div>
    ));

  const renderSidebarSearchList = () => {
    if (usersLoading) {
      return renderSidebarSkeletons();
    }

    if (usersError) {
      return (
        <div className="list-state error-state">
          <span>{usersError}</span>
          <button
            type="button"
            className="retry-btn"
            onClick={() => void loadUsers({ search: userSearchQuery })}
          >
            Retry
          </button>
        </div>
      );
    }

    if (users.length === 0) {
      return <div className="list-state">{usersEmptyMessage}</div>;
    }

    return users.map(renderUserItem);
  };

  const renderSidebarChatList = () => {
    const hasAnyConversation = conversationUsers.length > 0 || rooms.length > 0;

    if (sidebarBusy && !hasAnyConversation) {
      return renderSidebarSkeletons();
    }

    if (!sidebarBusy && !usersError && !roomsError && !hasAnyConversation) {
      return (
        <div className="list-state empty-groups-state">
          <span>No conversations yet. Open Friends to start a new chat.</span>
          <button type="button" className="retry-btn" onClick={handleOpenFriendsPanel}>
            Open friends
          </button>
        </div>
      );
    }

    return (
      <>
        {usersError && users.length === 0 ? (
          <div className="list-state error-state">
            <span>{usersError}</span>
            <button type="button" className="retry-btn" onClick={() => void loadUsers({ search: '' })}>
              Retry
            </button>
          </div>
        ) : (
          conversationUsers.map(renderUserItem)
        )}
        {roomsError && rooms.length === 0 ? (
          <div className="list-state error-state">
            <span>{roomsError}</span>
            <button type="button" className="retry-btn" onClick={() => void loadRooms()}>
              Retry
            </button>
          </div>
        ) : (
          rooms.map(renderRoomItem)
        )}
      </>
    );
  };

  const renderMainFriendItem = (user: User) => (
    <button
      type="button"
      key={user.id}
      className="main-list-item friend-main-item"
      onClick={() => handleUserSelect(user)}
    >
      <div className="main-list-avatar-wrap">
        {renderUserAvatar(user)}
        <span
          className={`main-list-presence-dot ${user.online ? 'online' : 'offline'}`}
          aria-hidden="true"
        />
      </div>
      <div className="main-list-copy">
        <strong>{getUserDisplayName(user)}</strong>
        <span>
          {user.lastMessageContent
            ? getConversationPreviewText(user, currentUser?.id ?? null)
            : shouldShowUsername(user)
              ? `@${user.username}`
              : 'Friend'}
        </span>
      </div>
      <span className={`main-status-pill ${user.online ? 'online' : 'offline'}`}>
        {user.online ? 'Online' : 'Offline'}
      </span>
    </button>
  );

  const renderMainPanelSkeletons = () => (
    <div className="main-list" aria-hidden="true">
      {USER_SKELETON_KEYS.map((key) => (
        <div key={key} className="main-list-item main-list-item-skeleton">
          <div className="skeleton-avatar" />
          <div className="skeleton-user-info">
            <div className="skeleton-line name" />
            <div className="skeleton-line status" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderFriendsPanel = () => {
    const onlineFriendCount = friends.filter((friend) => friend.online).length;

    return (
      <section className="main-panel people-panel" aria-labelledby="friends-panel-title">
        <div className="main-panel-header">
          <div className="main-panel-heading">
            <span className="panel-heading-icon">
              <FriendsIcon className="panel-heading-svg" />
            </span>
            <div>
              <span className="main-panel-eyebrow">Friends</span>
              <h3 id="friends-panel-title">Friend list</h3>
              <p>
                {friends.length} friends - {onlineFriendCount} online
              </p>
            </div>
          </div>
          <button
            type="button"
            className="panel-icon-action"
            onClick={() => void loadUsers({ search: '', silent: true })}
            aria-label="Refresh friend list"
            title="Refresh"
          >
            <RefreshIcon className="panel-action-icon" />
          </button>
        </div>

        {friends.length > 0 ? (
          <div className="main-panel-search" role="search">
            <input
              type="search"
              value={friendSearchQuery}
              onChange={(event) => handleFriendSearchChange(event.target.value)}
              className="main-panel-search-input"
              placeholder="Search friends by name or username"
              aria-label="Search friends by name or username"
              autoComplete="off"
              spellCheck={false}
            />
            {friendSearchQuery ? (
              <button
                type="button"
                className="main-panel-search-clear"
                onClick={handleClearFriendSearch}
                aria-label="Clear friend search"
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}

        {usersLoading && friends.length === 0 ? (
          renderMainPanelSkeletons()
        ) : usersError && friends.length === 0 ? (
          <div className="main-panel-state error-state">
            <span>{usersError}</span>
            <button
              type="button"
              className="retry-btn"
              onClick={() => void loadUsers({ search: '' })}
            >
              Retry
            </button>
          </div>
        ) : friends.length === 0 ? (
          <div className="main-panel-state panel-empty-state">
            <span className="panel-empty-icon">
              <FriendsIcon className="panel-heading-svg" />
            </span>
            <strong>No friends yet</strong>
            <span>Search username in the sidebar to add friends.</span>
          </div>
        ) : filteredFriends.length === 0 ? (
          <div className="main-panel-state panel-empty-state">
            <span className="panel-empty-icon">
              <FriendsIcon className="panel-heading-svg" />
            </span>
            <strong>No matching friends</strong>
            <span>Try another name or username.</span>
          </div>
        ) : (
          <div className="main-list">
            {filteredFriends.map(renderMainFriendItem)}
          </div>
        )}
      </section>
    );
  };

  const renderRequestItem = (friendship: Friendship) => {
    const requesterName = getUserDisplayName(friendship.requester);

    return (
      <div key={friendship.id} className="main-list-item request-main-item">
        <div className="main-list-avatar-wrap">
          {renderUserAvatar(friendship.requester)}
        </div>
        <div className="main-list-copy">
          <strong>{requesterName}</strong>
          {shouldShowUsername(friendship.requester) ? (
            <span>@{friendship.requester.username}</span>
          ) : (
            <span>Incoming friend request</span>
          )}
          <small>Waiting for your response</small>
        </div>
        <div className="request-actions">
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`accept-request-${friendship.id}`)}
            onClick={() =>
              void handleAcceptFriendRequest(friendship.id, `accept-request-${friendship.id}`)
            }
            aria-label={`Accept friend request from ${requesterName}`}
          >
            Accept
          </button>
          <button
            type="button"
            className="friend-action-btn secondary"
            disabled={friendActionKeys.includes(`decline-request-${friendship.id}`)}
            onClick={() =>
              void handleDeclineFriendRequest(friendship.id, `decline-request-${friendship.id}`)
            }
            aria-label={`Decline friend request from ${requesterName}`}
          >
            Decline
          </button>
        </div>
      </div>
    );
  };

  const renderRequestsPanel = () => (
    <section className="main-panel people-panel" aria-labelledby="requests-panel-title">
      <div className="main-panel-header">
        <div className="main-panel-heading">
          <span className="panel-heading-icon">
            <FriendRequestIcon className="panel-heading-svg" />
          </span>
          <div>
            <span className="main-panel-eyebrow">Requests</span>
            <h3 id="requests-panel-title">Friend requests</h3>
            <p>{friendRequestBadgeCount} pending requests</p>
          </div>
        </div>
        <button
          type="button"
          className="panel-icon-action"
          onClick={() =>
            void Promise.all([
              loadIncomingFriendRequests(),
              loadFriendSummary({ silent: true }),
            ])
          }
          aria-label="Refresh friend requests"
          title="Refresh"
        >
          <RefreshIcon className="panel-action-icon" />
        </button>
      </div>

      {friendRequestsLoading ? (
        renderMainPanelSkeletons()
      ) : friendRequestsError ? (
        <div className="main-panel-state error-state">
          <span>{friendRequestsError}</span>
          <button
            type="button"
            className="retry-btn"
            onClick={() => void loadIncomingFriendRequests()}
          >
            Retry
          </button>
        </div>
      ) : incomingFriendRequests.length === 0 ? (
        <div className="main-panel-state panel-empty-state">
          <span className="panel-empty-icon">
            <FriendRequestIcon className="panel-heading-svg" />
          </span>
          <strong>No pending requests</strong>
          <span>New requests will appear here.</span>
        </div>
      ) : (
        <div className="main-list">
          {incomingFriendRequests.map(renderRequestItem)}
        </div>
      )}
    </section>
  );

  const renderDetailsMemberItem = (user: User) => {
    const isCurrentUser = user.id === currentUser?.id;
    const presenceLabel = isCurrentUser
      ? `You - ${user.online ? 'Online' : 'Offline'}`
      : user.online
        ? 'Online'
        : 'Offline';

    return (
      <div key={user.id} className="details-member-item">
        {renderUserAvatar(user, 'user-avatar small-avatar')}
        <div className="details-member-copy">
          <strong>{getUserDisplayName(user)}</strong>
          {shouldShowUsername(user) ? <span>@{user.username}</span> : null}
        </div>
        <span className={`details-presence ${user.online ? 'online' : 'offline'}`}>
          {presenceLabel}
        </span>
      </div>
    );
  };

  const renderConversationDetails = () => {
    if (selectedUser) {
      return (
        <aside
          id="conversation-details"
          className="details-sidebar"
          aria-label="Conversation details"
        >
          <div className="details-header">
            <h3>Details</h3>
            <button
              type="button"
              className="details-close-btn"
              onClick={handleCloseConversationDetails}
              aria-label="Close conversation details"
              title="Close details"
            >
              <CloseIcon className="details-close-icon" />
            </button>
          </div>

          <div className="details-profile">
            {renderUserAvatar(selectedUser, 'user-avatar details-avatar')}
            <h4>{getUserDisplayName(selectedUser)}</h4>
            {shouldShowUsername(selectedUser) ? <span>@{selectedUser.username}</span> : null}
            <span className={`details-status ${selectedUser.online ? 'online' : 'offline'}`}>
              {selectedUser.online ? 'Online' : 'Offline'}
            </span>
          </div>

          <section className="details-section" aria-labelledby="private-details-title">
            <h4 id="private-details-title">Account</h4>
            <div className="details-row">
              <span>Username</span>
              <strong>@{selectedUser.username}</strong>
            </div>
            <div className="details-row">
              <span>Friendship</span>
              <strong>Friend</strong>
            </div>
          </section>
        </aside>
      );
    }

    if (selectedRoom) {
      const sortedParticipants = sortParticipantsForDetails(selectedRoom.participants);

      return (
        <aside
          id="conversation-details"
          className="details-sidebar"
          aria-label="Conversation details"
        >
          <div className="details-header">
            <h3>Details</h3>
            <button
              type="button"
              className="details-close-btn"
              onClick={handleCloseConversationDetails}
              aria-label="Close conversation details"
              title="Close details"
            >
              <CloseIcon className="details-close-icon" />
            </button>
          </div>

          <div className="details-profile">
            <div className="user-avatar room-avatar details-avatar">
              {getRoomInitial(selectedRoom)}
            </div>
            <h4>{selectedRoom.name}</h4>
            <span>{selectedRoom.participants.length} members</span>
          </div>

          <section className="details-section" aria-labelledby="group-members-title">
            <div className="details-section-heading">
              <h4 id="group-members-title">Members</h4>
              <span>{selectedRoom.participants.length}</span>
            </div>
            <div className="details-member-list">
              {sortedParticipants.map(renderDetailsMemberItem)}
            </div>
          </section>
        </aside>
      );
    }

    return null;
  };

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="header-left">
          <h2>Chat App</h2>
        </div>
        <nav className="header-right" aria-label="Account navigation">
          <button
            type="button"
            className={`header-icon-btn ${mainView === 'friends' ? 'active' : ''}`}
            onClick={handleOpenFriendsPanel}
            aria-pressed={mainView === 'friends'}
            aria-label="Friends list"
            title="Friends list"
          >
            <FriendsIcon className="header-icon" />
          </button>

          <div className="friend-request-menu">
            <button
              type="button"
              className={`header-icon-btn ${mainView === 'requests' ? 'active' : ''}`}
              onClick={handleOpenRequestsPanel}
              aria-pressed={mainView === 'requests'}
              aria-label={`Friend requests, ${friendRequestBadgeCount} pending`}
              title="Friend requests"
            >
              <FriendRequestIcon className="header-icon" />
              {friendRequestBadgeCount > 0 ? (
                <span className="request-badge">{friendRequestBadgeCount}</span>
              ) : null}
            </button>
          </div>

          <div className="profile-menu">
            <button
              type="button"
              className={`header-icon-btn profile-icon-btn ${profileMenuOpen ? 'active' : ''}`}
              onClick={handleToggleProfileMenu}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              aria-label={`Profile menu for ${currentUserDisplayName}`}
              title="Profile"
            >
              <ProfileIcon className="header-icon" />
              <span
                className={`profile-presence-dot ${currentUserOnline ? 'online' : 'offline'}`}
                aria-hidden="true"
              />
            </button>

            {profileMenuOpen ? (
              <div className="profile-dropdown" role="menu">
                <div className="profile-summary">
                  {renderUserAvatar(currentUser, 'user-avatar small-avatar')}
                  <div className="profile-copy">
                    <strong>{currentUserDisplayName}</strong>
                    {currentUser?.username ? <span>@{currentUser.username}</span> : null}
                  </div>
                </div>
                <span
                  className={`account-status ${currentUserOnline ? 'online' : 'offline'}`}
                  aria-live="polite"
                  title={currentUserOnline ? 'Online' : 'Offline'}
                >
                  <span className="account-status-dot" aria-hidden="true" />
                  {currentUserOnline ? 'Online' : 'Offline'}
                </span>
                <button
                  type="button"
                  onClick={handleOpenProfileEditor}
                  className="profile-edit-btn"
                  role="menuitem"
                >
                  Edit profile
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="profile-logout-btn"
                  role="menuitem"
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <div className="chat-container">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title-row">
              <h3>Chats</h3>
              <button
                type="button"
                className="new-group-btn"
                onClick={handleOpenCreateGroup}
                aria-label="Create group"
                title="Create group"
              >
                <GroupPlusIcon className="new-group-icon" />
              </button>
            </div>
            <div className="user-search" role="search">
              <input
                type="search"
                value={userSearchQuery}
                onChange={(event) => handleUserSearchChange(event.target.value)}
                className="user-search-input"
                placeholder="Search username to add"
                aria-label="Search users by username"
                autoComplete="off"
                spellCheck={false}
              />
              {userSearchQuery ? (
                <button
                  type="button"
                  className="user-search-clear"
                  onClick={handleClearUserSearch}
                  aria-label="Clear user search"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
          <div className="user-list" aria-busy={sidebarBusy} aria-label="Chat list">
            {hasUserSearch ? renderSidebarSearchList() : renderSidebarChatList()}
          </div>
        </aside>

        <main className={`chat-area ${mainView !== 'chat' ? 'main-view-open' : ''}`}>
          {mainView === 'friends' ? (
            renderFriendsPanel()
          ) : mainView === 'requests' ? (
            renderRequestsPanel()
          ) : selectedConversationOpen ? (
            <>
              <div className="chat-area-header">
                <div className="selected-user">
                  {selectedRoom ? (
                    <div className="user-avatar room-avatar">
                      {getRoomInitial(selectedRoom)}
                    </div>
                  ) : (
                    renderUserAvatar(selectedUser)
                  )}
                  <div className="selected-user-copy">
                    <div className="user-name">{selectedConversationName}</div>
                    {selectedRoom ? (
                      <div className="user-meta">
                        <span className="user-status">
                          {selectedRoom.participants.length} members
                        </span>
                        <span className="user-username">
                          {getRoomMemberSummary(selectedRoom, currentUser?.id)}
                        </span>
                      </div>
                    ) : selectedUser ? (
                      <div className="user-meta">
                        <span className={`user-status ${selectedUser.online ? 'online' : 'offline'}`}>
                          {selectedUser.online ? 'Online' : 'Offline'}
                        </span>
                        {shouldShowUsername(selectedUser) ? (
                          <span className="user-username">@{selectedUser.username}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={`conversation-details-toggle ${detailsOpen ? 'active' : ''}`}
                  onClick={handleToggleConversationDetails}
                  aria-label={detailsOpen ? 'Hide conversation details' : 'Show conversation details'}
                  aria-expanded={detailsOpen}
                  aria-controls="conversation-details"
                  title={detailsOpen ? 'Hide details' : 'Show details'}
                >
                  <InfoIcon className="conversation-details-icon" />
                </button>
              </div>

              <div className="messages-container" aria-busy={messagesLoading}>
                {messagesLoading ? (
                  MESSAGE_SKELETON_KEYS.map((key, index) => (
                    <div
                      key={key}
                      className={`message message-skeleton ${index % 2 === 0 ? 'received' : 'sent'}`}
                      aria-hidden="true"
                    >
                      <div className="skeleton-bubble" />
                    </div>
                  ))
                ) : messagesError ? (
                  <div className="message-state error-state">
                    <span>{messagesError}</span>
                    <button
                      type="button"
                      className="retry-btn"
                      onClick={() => {
                        if (selectedUser) {
                          void loadMessages(selectedUser.id);
                        } else if (selectedRoom) {
                          void loadRoomMessages(selectedRoom.id);
                        }
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="message-state">No messages yet.</div>
                ) : (
                  messageListItems.map((item) => {
                    if (item.type === 'date') {
                      return (
                        <div key={item.key} className="message-date-divider">
                          <span>{item.label}</span>
                        </div>
                      );
                    }

                    const { message, groupedWithPrevious, groupedWithNext, showSender } = item;
                    const isSentByCurrentUser = message.senderId === currentUser?.id;

                    return (
                      <div
                        key={item.key}
                        className={`message ${isSentByCurrentUser ? 'sent' : 'received'} ${message.deliveryStatus ?? ''} ${groupedWithPrevious ? 'grouped-with-previous' : ''} ${groupedWithNext ? 'grouped-with-next' : ''}`}
                      >
                        {showSender ? (
                          <div className="message-sender">
                            {getMessageSenderName(message, selectedRoom)}
                          </div>
                        ) : null}
                        <div className="message-content">{message.content}</div>
                        {!groupedWithNext || message.deliveryStatus === 'failed' ? (
                          <div className="message-time">
                            <span>{formatMessageTime(message.timestamp)}</span>
                            {isSentByCurrentUser ? (
                              <>
                                <span className={`message-read-status ${message.deliveryStatus ?? ''}`}>
                                  {getDeliveryStatusLabel(message)}
                                </span>
                                {message.deliveryStatus === 'failed' ? (
                                  <button
                                    type="button"
                                    className="message-retry-btn"
                                    onClick={() => handleRetryMessage(message)}
                                  >
                                    Retry
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
                {!messagesLoading && selectedUser && typingUserId === selectedUser.id ? (
                  <div className="typing-indicator">
                    {getUserDisplayName(selectedUser)} is typing...
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="message-input-form">
                <textarea
                  value={messageInput}
                  onChange={(e) => handleMessageInputChange(e.target.value)}
                  onKeyDown={handleMessageInputKeyDown}
                  placeholder={`Message ${selectedConversationName}`}
                  className="message-input"
                  rows={1}
                />
                <button type="submit" className="send-btn" disabled={!messageInput.trim()}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="no-chat-selected">
              <p>Select a friend or group to start chatting</p>
            </div>
          )}
        </main>

        {mainView === 'chat' && selectedConversationOpen && detailsOpen ? (
          <>
            <button
              type="button"
              className="details-backdrop"
              onClick={handleCloseConversationDetails}
              aria-label="Close conversation details"
            />
            {renderConversationDetails()}
          </>
        ) : null}
      </div>

      {profileEditorOpen ? (
        <div className="modal-backdrop">
          <div
            className="group-modal profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
          >
            <form onSubmit={handleUpdateProfile} className="group-form profile-form">
              <div className="group-modal-header">
                <div>
                  <h3 id="edit-profile-title">Edit profile</h3>
                  <p>@{currentUser?.username}</p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseProfileEditor}
                  aria-label="Close edit profile"
                  disabled={profileSaving}
                >
                  ×
                </button>
              </div>

              <div className="profile-avatar-editor">
                <div className="user-avatar profile-avatar-preview">
                  {profileAvatarPreview ? (
                    <img src={profileAvatarPreview} alt="" />
                  ) : (
                    getUserInitial(currentUser)
                  )}
                </div>
                <div className="profile-avatar-actions">
                  <label className="avatar-upload-btn">
                    <input
                      type="file"
                      accept={AVATAR_ACCEPT}
                      onChange={handleProfileAvatarChange}
                      disabled={profileSaving}
                    />
                    Change avatar
                  </label>
                  <small>JPG, PNG, GIF, or WebP. Max {MAX_AVATAR_SIZE_MB}MB.</small>
                </div>
              </div>

              <label className="group-field">
                <span>Full name</span>
                <input
                  type="text"
                  value={profileFullName}
                  onChange={(event) => {
                    setProfileFullName(event.target.value);
                    setProfileError('');
                  }}
                  placeholder="Ngoc Thinh"
                  maxLength={100}
                  autoFocus
                  disabled={profileSaving}
                />
              </label>

              {profileError ? <div className="group-error">{profileError}</div> : null}

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCloseProfileEditor}
                  disabled={profileSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="send-btn" disabled={profileSaving}>
                  {profileSaving ? 'Saving' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {createGroupOpen ? (
        <div className="modal-backdrop">
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-group-title"
          >
            <form onSubmit={handleCreateGroup} className="group-form">
              <div className="group-modal-header">
                <div>
                  <h3 id="create-group-title">New group</h3>
                  <p>{groupMemberRequirementText}</p>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={handleCloseCreateGroup}
                  aria-label="Close create group"
                >
                  ×
                </button>
              </div>

              <label className="group-field">
                <span>Group name</span>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => {
                    setGroupName(event.target.value);
                    setGroupError('');
                  }}
                  placeholder="Weekend plans"
                  maxLength={100}
                  autoFocus
                />
              </label>

              <div className="group-field">
                <div className="group-field-heading">
                  <span>Members</span>
                  <small>Minimum {MIN_GROUP_MEMBERS} members</small>
                </div>
                <div className="group-member-list">
                  {friends.length === 0 ? (
                    <div className="list-state">No friends available.</div>
                  ) : (
                    friends.map((user) => (
                      <label key={user.id} className="group-member-option">
                        <input
                          type="checkbox"
                          checked={selectedGroupMemberIds.includes(user.id)}
                          onChange={() => handleToggleGroupMember(user.id)}
                        />
                        {renderUserAvatar(user, 'user-avatar small-avatar')}
                        <span className="group-member-copy">
                          <span>{getUserDisplayName(user)}</span>
                          {shouldShowUsername(user) ? <small>@{user.username}</small> : null}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {groupError ? <div className="group-error">{groupError}</div> : null}

              <div className="group-modal-actions">
                <button type="button" className="secondary-btn" onClick={handleCloseCreateGroup}>
                  Cancel
                </button>
                <button type="submit" className="send-btn" disabled={!canCreateGroup}>
                  {groupCreating ? 'Creating' : 'Create group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
