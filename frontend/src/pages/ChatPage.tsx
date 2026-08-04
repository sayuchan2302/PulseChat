import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL, ROUTES } from '../config/constants';
import type {
  ChatRoom,
  CloudinaryUploadSignature,
  ConnectionStatus,
  Friendship,
  FriendshipSummary,
  LinkPreview,
  MediaAttachment,
  Message,
  MessagePage,
  MessageReply,
  MessageType,
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
const MESSAGE_PAGE_SIZE = 30;
const LOAD_OLDER_SCROLL_THRESHOLD = 80;
const MIN_GROUP_MEMBERS = 3;
const MIN_GROUP_INVITED_MEMBERS = MIN_GROUP_MEMBERS - 1;
const BIO_MAX_LENGTH = 160;
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_SIZE_MB = MAX_AVATAR_SIZE_BYTES / 1024 / 1024;
const MAX_IMAGE_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_MEDIA_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_MEDIA_SIZE_MB = MAX_IMAGE_MEDIA_SIZE_BYTES / 1024 / 1024;
const MAX_VIDEO_MEDIA_SIZE_MB = MAX_VIDEO_MEDIA_SIZE_BYTES / 1024 / 1024;
const ACCEPTED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const AVATAR_ACCEPT = ACCEPTED_AVATAR_TYPES.join(',');
const MEDIA_ACCEPT = 'image/*,video/*';
const TEXT_URL_REGEX = /(https?:\/\/[^\s<>'"`]+)/gi;
const USER_SKELETON_KEYS = ['user-skeleton-1', 'user-skeleton-2', 'user-skeleton-3'];
const MESSAGE_SKELETON_KEYS = [
  'message-skeleton-1',
  'message-skeleton-2',
  'message-skeleton-3',
  'message-skeleton-4',
];
const QUICK_REACTION_EMOJIS = ['👍', '💜', '😂', '😮', '😢', '🔥'] as const;
const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: [
      { symbol: '😀', label: 'grinning face' },
      { symbol: '😄', label: 'smiling face' },
      { symbol: '😁', label: 'beaming face' },
      { symbol: '😂', label: 'face with tears of joy' },
      { symbol: '🤣', label: 'rolling on the floor laughing' },
      { symbol: '😊', label: 'smiling face with smiling eyes' },
      { symbol: '😍', label: 'smiling face with heart eyes' },
      { symbol: '😘', label: 'face blowing a kiss' },
      { symbol: '😎', label: 'smiling face with sunglasses' },
      { symbol: '🥹', label: 'holding back tears' },
      { symbol: '😭', label: 'loudly crying face' },
      { symbol: '😡', label: 'angry face' },
    ],
  },
  {
    name: 'Gestures',
    emojis: [
      { symbol: '👍', label: 'thumbs up' },
      { symbol: '👎', label: 'thumbs down' },
      { symbol: '👏', label: 'clapping hands' },
      { symbol: '🙌', label: 'raising hands' },
      { symbol: '🙏', label: 'folded hands' },
      { symbol: '🤝', label: 'handshake' },
      { symbol: '💪', label: 'flexed biceps' },
      { symbol: '👌', label: 'ok hand' },
      { symbol: '✌️', label: 'victory hand' },
      { symbol: '🤞', label: 'crossed fingers' },
      { symbol: '👋', label: 'waving hand' },
      { symbol: '🫶', label: 'heart hands' },
    ],
  },
  {
    name: 'Hearts',
    emojis: [
      { symbol: '❤️', label: 'red heart' },
      { symbol: '💜', label: 'purple heart' },
      { symbol: '💙', label: 'blue heart' },
      { symbol: '💚', label: 'green heart' },
      { symbol: '💛', label: 'yellow heart' },
      { symbol: '🧡', label: 'orange heart' },
      { symbol: '🤍', label: 'white heart' },
      { symbol: '💔', label: 'broken heart' },
      { symbol: '💕', label: 'two hearts' },
      { symbol: '💞', label: 'revolving hearts' },
      { symbol: '💘', label: 'heart with arrow' },
      { symbol: '💝', label: 'heart with ribbon' },
    ],
  },
  {
    name: 'Objects',
    emojis: [
      { symbol: '🔥', label: 'fire' },
      { symbol: '✨', label: 'sparkles' },
      { symbol: '🎉', label: 'party popper' },
      { symbol: '🎂', label: 'birthday cake' },
      { symbol: '🌟', label: 'glowing star' },
      { symbol: '💯', label: 'hundred points' },
      { symbol: '✅', label: 'check mark' },
      { symbol: '☕', label: 'hot beverage' },
      { symbol: '🍕', label: 'pizza' },
      { symbol: '🎧', label: 'headphones' },
      { symbol: '📚', label: 'books' },
      { symbol: '💻', label: 'laptop' },
    ],
  },
] as const;

type DeliveryStatus = 'sending' | 'sent' | 'failed';

type ChatMessage = Message & {
  deliveryStatus?: DeliveryStatus;
};

type SendMessagePayload = {
  receiverId: number;
  content: string;
  clientId: string;
  replyToMessageId?: number;
  type?: MessageType;
  media?: MediaAttachment;
};

type SendRoomMessagePayload = {
  content: string;
  clientId: string;
  replyToMessageId?: number;
  type?: MessageType;
  media?: MediaAttachment;
};

type PendingMedia = {
  file: File;
  previewUrl: string;
  type: Extract<MessageType, 'IMAGE' | 'VIDEO'>;
  resourceType: 'image' | 'video';
};

type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  resource_type: 'image' | 'video';
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
};

type LocalMediaUploadResult = {
  url: string;
  publicId: string;
  resourceType: 'image' | 'video';
  format?: string;
  bytes?: number;
};

type LoadOptions = {
  silent?: boolean;
  search?: string;
};

type MainView = 'chat' | 'friends' | 'requests';

type ChatRouteState =
  | { kind: 'chat' }
  | { kind: 'friends' }
  | { kind: 'requests' }
  | { kind: 'user'; username: string }
  | { kind: 'room'; roomId: number }
  | { kind: 'unknown' };

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

function EmojiIcon({ className }: HeaderIconProps) {
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
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </svg>
  );
}

function MediaIcon({ className }: HeaderIconProps) {
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
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L7 19" />
      <path d="M16 5v4" />
      <path d="M18 7h-4" />
    </svg>
  );
}

function ReplyIcon({ className }: HeaderIconProps) {
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
      <path d="m9 17-5-5 5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function CopyIcon({ className }: HeaderIconProps) {
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
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function RecallIcon({ className }: HeaderIconProps) {
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
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function MoreIcon({ className }: HeaderIconProps) {
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
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function toDeliveredMessage(message: Message): ChatMessage {
  return {
    ...message,
    deliveryStatus: 'sent',
  };
}

function getMessageTimestampValue(message: ChatMessage) {
  const timestampValue = Date.parse(message.timestamp);
  return Number.isNaN(timestampValue) ? 0 : timestampValue;
}

function sortMessagesByTimeline(messages: ChatMessage[]) {
  return [...messages].sort((firstMessage, secondMessage) => {
    const timestampDelta =
      getMessageTimestampValue(firstMessage) - getMessageTimestampValue(secondMessage);

    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return firstMessage.id - secondMessage.id;
  });
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

function mergeKnownMessageUpdate(messages: ChatMessage[], incomingMessage: Message) {
  const deliveredMessage = toDeliveredMessage(incomingMessage);
  const existingMessageIndex = messages.findIndex((message) => message.id === incomingMessage.id);

  if (existingMessageIndex < 0) {
    return messages;
  }

  return messages.map((message, index) =>
    index === existingMessageIndex ? { ...message, ...deliveredMessage } : message
  );
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

function isRoomParticipant(room: ChatRoom, userId: number | null) {
  return userId !== null && room.participants.some((participant) => participant.id === userId);
}

function mergeServerMessagesWithPending(
  currentMessages: ChatMessage[],
  serverMessages: Message[]
) {
  const mergedMessages = [...currentMessages];

  serverMessages.map(toDeliveredMessage).forEach((deliveredMessage) => {
    const existingMessageIndex = mergedMessages.findIndex(
      (message) => message.id === deliveredMessage.id
    );

    if (existingMessageIndex >= 0) {
      mergedMessages[existingMessageIndex] = {
        ...mergedMessages[existingMessageIndex],
        ...deliveredMessage,
      };
      return;
    }

    if (deliveredMessage.clientId) {
      const optimisticMessageIndex = mergedMessages.findIndex(
        (message) => message.clientId === deliveredMessage.clientId
      );

      if (optimisticMessageIndex >= 0) {
        mergedMessages[optimisticMessageIndex] = deliveredMessage;
        return;
      }
    }

    mergedMessages.push(deliveredMessage);
  });

  return sortMessagesByTimeline(mergedMessages);
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
  return user.id === presence.userId
    ? {
      ...user,
      online: presence.online,
      lastSeenAt: presence.lastSeenAt ?? user.lastSeenAt,
    }
    : user;
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

function getProfileUserFromFriendship(friendship: Friendship, currentUserId: number | null) {
  if (friendship.requester.id === currentUserId) {
    return friendship.receiver;
  }

  return friendship.requester;
}

function getUserFriendshipStatusFromFriendship(
  friendship: Friendship,
  currentUserId: number | null
): User['friendshipStatus'] {
  if (friendship.status === 'accepted') {
    return 'accepted';
  }

  if (friendship.status === 'declined') {
    return 'declined';
  }

  return friendship.receiver.id === currentUserId ? 'pending_incoming' : 'pending_outgoing';
}

function applyFriendshipToProfileUser(
  user: User,
  friendship: Friendship,
  currentUserId: number | null
) {
  const profileUser = getProfileUserFromFriendship(friendship, currentUserId);
  if (user.id !== profileUser.id) {
    return user;
  }

  return {
    ...applyProfileToUser(user, profileUser),
    friendshipId: friendship.id,
    friendshipStatus: getUserFriendshipStatusFromFriendship(friendship, currentUserId),
  };
}

function mergeViewedProfileUser(viewedUser: User, refreshedUser?: User) {
  if (!refreshedUser) {
    return viewedUser;
  }

  return {
    ...viewedUser,
    ...refreshedUser,
    friendshipId: viewedUser.friendshipId ?? refreshedUser.friendshipId,
    friendshipStatus: viewedUser.friendshipStatus ?? refreshedUser.friendshipStatus,
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

function getChatRoute() {
  return ROUTES.CHAT;
}

function getFriendsRoute() {
  return `${ROUTES.CHAT}/friends`;
}

function getRequestsRoute() {
  return `${ROUTES.CHAT}/requests`;
}

function getUserChatRoute(username: string) {
  return `${ROUTES.CHAT}/u/${encodeURIComponent(username)}`;
}

function getRoomChatRoute(roomId: number) {
  return `${ROUTES.CHAT}/g/${roomId}`;
}

function safeDecodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

function parseChatRoute(pathname: string): ChatRouteState {
  const chatBase = ROUTES.CHAT.replace(/\/$/, '');
  const normalizedPath = pathname.replace(/\/+$/, '') || chatBase;
  if (normalizedPath === chatBase) {
    return { kind: 'chat' };
  }

  if (!normalizedPath.startsWith(`${chatBase}/`)) {
    return { kind: 'unknown' };
  }

  const segments = normalizedPath
    .slice(chatBase.length + 1)
    .split('/')
    .filter(Boolean)
    .map(safeDecodePathSegment);

  if (segments.length === 1 && segments[0] === 'friends') {
    return { kind: 'friends' };
  }

  if (segments.length === 1 && segments[0] === 'requests') {
    return { kind: 'requests' };
  }

  if (segments.length === 2 && segments[0] === 'u' && segments[1]) {
    return { kind: 'user', username: segments[1] };
  }

  if (segments.length === 2 && segments[0] === 'g') {
    const roomId = Number(segments[1]);
    return Number.isInteger(roomId) && roomId > 0 ? { kind: 'room', roomId } : { kind: 'unknown' };
  }

  return { kind: 'unknown' };
}

function getMessageType(message: Message): MessageType {
  return message.type ?? 'TEXT';
}

function isMediaMessage(message: Message) {
  const type = getMessageType(message);
  return type === 'IMAGE' || type === 'VIDEO';
}

function getMessagePreviewContent(message: Message) {
  if (message.recalled) {
    return 'Message recalled';
  }

  const content = message.content?.trim();
  if (content) {
    return content;
  }

  if (getMessageType(message) === 'IMAGE') {
    return 'Photo';
  }

  if (getMessageType(message) === 'VIDEO') {
    return 'Video';
  }

  return '';
}

function applyMediaPayload(message: ChatMessage, media?: MediaAttachment): ChatMessage {
  if (!media) {
    return message;
  }

  return {
    ...message,
    mediaUrl: media.url,
    mediaPublicId: media.publicId,
    mediaResourceType: media.resourceType,
    mediaFormat: media.format,
    mediaBytes: media.bytes,
    mediaWidth: media.width,
    mediaHeight: media.height,
    mediaDuration: media.duration,
  };
}

function getMediaPayloadFromMessage(message: Message): MediaAttachment | undefined {
  if (!isMediaMessage(message) || !message.mediaUrl || !message.mediaPublicId || !message.mediaResourceType) {
    return undefined;
  }

  return {
    url: message.mediaUrl,
    publicId: message.mediaPublicId,
    resourceType: message.mediaResourceType,
    format: message.mediaFormat,
    bytes: message.mediaBytes,
    width: message.mediaWidth,
    height: message.mediaHeight,
    duration: message.mediaDuration,
  };
}

function createReplyFromMessage(message: ChatMessage | null): MessageReply | null {
  if (!message || message.id <= 0) {
    return null;
  }

  return {
    id: message.id,
    content: getMessagePreviewContent(message) || 'Message',
    type: getMessageType(message),
    senderId: message.senderId,
    senderName: message.senderFullName?.trim() || message.senderUsername || 'Unknown',
    recalled: Boolean(message.recalled),
  };
}

function getPendingMediaType(file: File): Pick<PendingMedia, 'type' | 'resourceType'> | null {
  if (file.type.startsWith('image/')) {
    return { type: 'IMAGE', resourceType: 'image' };
  }

  if (file.type.startsWith('video/')) {
    return { type: 'VIDEO', resourceType: 'video' };
  }

  return null;
}

function getMediaSizeError(file: File, pendingMediaType: Pick<PendingMedia, 'type'>) {
  if (pendingMediaType.type === 'IMAGE' && file.size > MAX_IMAGE_MEDIA_SIZE_BYTES) {
    return `Image must be ${MAX_IMAGE_MEDIA_SIZE_MB}MB or smaller.`;
  }

  if (pendingMediaType.type === 'VIDEO' && file.size > MAX_VIDEO_MEDIA_SIZE_BYTES) {
    return `Video must be ${MAX_VIDEO_MEDIA_SIZE_MB}MB or smaller.`;
  }

  return '';
}

function getFileFormat(file: File) {
  const extension = file.name.split('.').pop();
  return extension ? extension.toLowerCase() : undefined;
}

function cloudinaryResultToMedia(result: CloudinaryUploadResult): MediaAttachment {
  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    duration: result.duration,
  };
}

function createOptimisticMessage(
  tempId: number,
  senderId: number,
  receiverId: number,
  content: string,
  clientId: string,
  type: MessageType = 'TEXT',
  media?: MediaAttachment,
  replyTo?: MessageReply | null
): ChatMessage {
  return applyMediaPayload({
    id: tempId,
    content,
    type,
    replyTo,
    senderId,
    receiverId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  }, media);
}

function createOptimisticRoomMessage(
  tempId: number,
  sender: User,
  chatRoomId: number,
  content: string,
  clientId: string,
  type: MessageType = 'TEXT',
  media?: MediaAttachment,
  replyTo?: MessageReply | null
): ChatMessage {
  return applyMediaPayload({
    id: tempId,
    content,
    type,
    replyTo,
    senderId: sender.id,
    senderUsername: sender.username,
    senderFullName: getUserDisplayName(sender),
    receiverId: null,
    chatRoomId,
    timestamp: new Date().toISOString(),
    read: false,
    clientId,
    deliveryStatus: 'sending',
  }, media);
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

function getGroupedMessageReactions(message: ChatMessage, currentUserId: number | null) {
  const reactions = message.reactions ?? [];
  const groupedReactions = new Map<string, {
    emoji: string;
    count: number;
    reactedByCurrentUser: boolean;
    title: string;
  }>();

  reactions.forEach((reaction) => {
    const currentGroup = groupedReactions.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reactedByCurrentUser: false,
      title: '',
    };
    const displayName = reaction.fullName?.trim() || reaction.username;

    currentGroup.count += 1;
    currentGroup.reactedByCurrentUser ||= reaction.userId === currentUserId;
    currentGroup.title = currentGroup.title ? `${currentGroup.title}, ${displayName}` : displayName;
    groupedReactions.set(reaction.emoji, currentGroup);
  });

  return Array.from(groupedReactions.values());
}

function hasCurrentUserReaction(message: ChatMessage, currentUserId: number | null, emoji?: string) {
  if (currentUserId === null) {
    return false;
  }

  return (message.reactions ?? []).some((reaction) =>
    reaction.userId === currentUserId && (!emoji || reaction.emoji === emoji)
  );
}

function canUseMessageActions(message: ChatMessage) {
  return message.id > 0 && message.deliveryStatus !== 'failed' && !message.recalled;
}

function getBrowserAwareConnectionStatus(status: ConnectionStatus): ConnectionStatus {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }

  return status;
}

function getUserDisplayName(user: User | null) {
  return user?.nickname?.trim() || user?.fullName?.trim() || user?.username || '';
}

function getUserAccountDisplayName(user: User | null) {
  return user?.fullName?.trim() || user?.username || '';
}

function getUserInitial(user: User | null) {
  return getUserDisplayName(user).charAt(0).toUpperCase() || '?';
}

function getApiAssetUrl(assetUrl?: string | null) {
  const trimmedAssetUrl = assetUrl?.trim();
  if (!trimmedAssetUrl) {
    return '';
  }

  if (/^(https?:|blob:|data:)/i.test(trimmedAssetUrl)) {
    return trimmedAssetUrl;
  }

  const baseUrl = new URL(
    API_BASE_URL,
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  );
  const apiPath = baseUrl.pathname.replace(/\/$/, '');
  const assetPath = trimmedAssetUrl.startsWith('/') ? trimmedAssetUrl : `/${trimmedAssetUrl}`;
  const resolvedPath =
    apiPath && !assetPath.startsWith(`${apiPath}/`) ? `${apiPath}${assetPath}` : assetPath;

  return `${baseUrl.origin}${resolvedPath}`;
}

function getAvatarUrl(avatar?: string | null) {
  return getApiAssetUrl(avatar);
}

function getMediaUrl(mediaUrl?: string | null) {
  return getApiAssetUrl(mediaUrl);
}

function trimUrlToken(rawUrl: string) {
  let url = rawUrl;
  while (url && /[.,!?;:)\]}]/.test(url.charAt(url.length - 1))) {
    url = url.slice(0, -1);
  }

  return url;
}

function renderLinkedText(text: string) {
  if (!text) {
    return null;
  }

  const nodes = [];
  let lastIndex = 0;
  TEXT_URL_REGEX.lastIndex = 0;

  for (const match of text.matchAll(TEXT_URL_REGEX)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;
    const url = trimUrlToken(rawUrl);
    if (!url) {
      continue;
    }

    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    nodes.push(
      <a
        key={`link-${matchIndex}-${url}`}
        className="message-text-link"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        {url}
      </a>
    );

    const trailingText = rawUrl.slice(url.length);
    if (trailingText) {
      nodes.push(trailingText);
    }

    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}

function hasLinkPreview(preview?: LinkPreview | null) {
  return Boolean(preview?.url);
}

function renderLinkPreviewCard(preview?: LinkPreview | null, onImageLoad?: () => void) {
  const url = preview?.url;
  if (!url) {
    return null;
  }

  const imageUrl = preview?.imageUrl?.trim();
  const title = preview?.title?.trim() || url;
  const description = preview?.description?.trim();
  const domain = preview?.domain?.trim() || url;

  return (
    <a
      className="link-preview-card"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open link preview for ${title}`}
    >
      {imageUrl ? (
        <img
          className="link-preview-image"
          src={imageUrl}
          alt=""
          loading="lazy"
          onLoad={onImageLoad}
          onError={onImageLoad}
        />
      ) : null}
      <span className="link-preview-copy">
        <span className="link-preview-domain">{domain}</span>
        <strong className="link-preview-title">{title}</strong>
        {description ? (
          <span className="link-preview-description">{description}</span>
        ) : null}
      </span>
    </a>
  );
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

function getRelationshipLabel(user: User) {
  switch (user.friendshipStatus) {
    case 'accepted':
      return 'Friend';
    case 'pending_incoming':
      return 'Request received';
    case 'pending_outgoing':
      return 'Pending';
    case 'declined':
    case 'none':
    case undefined:
    default:
      return 'Not friends';
  }
}

function formatRelativeTime(timestamp?: string) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const secondsDifference = Math.round((date.getTime() - Date.now()) / 1000);
  if (secondsDifference > 0) {
    return 'just now';
  }

  const absoluteSeconds = Math.abs(secondsDifference);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absoluteSeconds < 60) {
    return 'just now';
  }

  if (absoluteSeconds < 3600) {
    return formatter.format(Math.round(secondsDifference / 60), 'minute');
  }

  if (absoluteSeconds < 86400) {
    return formatter.format(Math.round(secondsDifference / 3600), 'hour');
  }

  if (absoluteSeconds < 2592000) {
    return formatter.format(Math.round(secondsDifference / 86400), 'day');
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getPresenceLabel(user: User | null) {
  if (!user) {
    return 'Offline';
  }

  if (user.online) {
    return 'Online';
  }

  const lastSeen = formatRelativeTime(user.lastSeenAt);
  return lastSeen ? `Last seen ${lastSeen}` : 'Offline';
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
    lastMessageContent: getMessagePreviewContent(message),
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
    lastMessageContent: getMessagePreviewContent(message),
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
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaViewerMessage, setMediaViewerMessage] = useState<ChatMessage | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [typingUserId, setTypingUserId] = useState<number | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
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
  const [groupSettingsName, setGroupSettingsName] = useState('');
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<number[]>([]);
  const [groupMemberNicknames, setGroupMemberNicknames] = useState<Record<number, string>>({});
  const [openGroupMemberMenuId, setOpenGroupMemberMenuId] = useState<number | null>(null);
  const [editingGroupMemberNicknameId, setEditingGroupMemberNicknameId] = useState<number | null>(
    null
  );
  const [groupSettingsPendingAction, setGroupSettingsPendingAction] = useState<string | null>(null);
  const [groupSettingsError, setGroupSettingsError] = useState('');
  const [profileFullName, setProfileFullName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [viewedProfileUser, setViewedProfileUser] = useState<User | null>(null);
  const [viewedProfileLoading, setViewedProfileLoading] = useState(false);
  const [viewedProfileError, setViewedProfileError] = useState('');
  const [profileActionError, setProfileActionError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(shouldOpenConversationDetailsByDefault);
  const currentUserIdRef = useRef<number | null>(null);
  const selectedUserIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const userSearchQueryRef = useRef('');
  const viewedProfileUsernameRef = useRef('');
  const optimisticMessageIdRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const hasLoadedInitialUsersRef = useRef(false);
  const olderMessagesLoadingRef = useRef(false);
  const hasMoreMessagesRef = useRef(false);
  const nextMessageBeforeRef = useRef<number | null>(null);
  const skipNextAutoScrollRef = useRef(false);
  const pendingInitialMessageScrollRef = useRef(false);
  const blockOlderMessagesAutoLoadRef = useRef(false);
  const hasUserInteractedWithMessagesRef = useRef(false);
  const releaseInitialScrollBlockFrameRef = useRef<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageInputSelectionRef = useRef({ start: 0, end: 0 });
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedUserId = selectedUser?.id ?? null;
  const selectedRoomId = selectedRoom?.id ?? null;

  useEffect(() => {
    setGroupSettingsName(selectedRoom?.name ?? '');
    setSelectedAddMemberIds([]);
    setGroupMemberNicknames(
      Object.fromEntries(
        selectedRoom?.participants.map((participant) => [
          participant.id,
          participant.nickname ?? '',
        ]) ?? []
      )
    );
    setOpenGroupMemberMenuId(null);
    setEditingGroupMemberNicknameId(null);
    setGroupSettingsError('');
  }, [selectedRoom?.id, selectedRoom?.name, selectedRoom?.participants]);

  const clearInitialScrollBlockRelease = useCallback(() => {
    if (releaseInitialScrollBlockFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(releaseInitialScrollBlockFrameRef.current);
    releaseInitialScrollBlockFrameRef.current = null;
  }, []);

  const forceScrollToLatestMessage = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: 'auto',
      block: 'end',
    });
  }, []);

  const releaseInitialScrollBlock = useCallback(() => {
    clearInitialScrollBlockRelease();
    releaseInitialScrollBlockFrameRef.current = window.requestAnimationFrame(() => {
      releaseInitialScrollBlockFrameRef.current = window.requestAnimationFrame(() => {
        blockOlderMessagesAutoLoadRef.current = false;
        releaseInitialScrollBlockFrameRef.current = null;
      });
    });
  }, [clearInitialScrollBlockRelease]);

  const scrollToLatestMessage = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      if (behavior === 'auto') {
        forceScrollToLatestMessage();
        return;
      }

      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
        return;
      }

      messagesEndRef.current?.scrollIntoView({
        behavior,
        block: 'end',
      });
    },
    [forceScrollToLatestMessage]
  );

  const resetMessagePagination = useCallback(() => {
    olderMessagesLoadingRef.current = false;
    hasMoreMessagesRef.current = false;
    nextMessageBeforeRef.current = null;
    skipNextAutoScrollRef.current = false;
    pendingInitialMessageScrollRef.current = true;
    blockOlderMessagesAutoLoadRef.current = true;
    hasUserInteractedWithMessagesRef.current = false;
    clearInitialScrollBlockRelease();
    setOlderMessagesLoading(false);
    setHasMoreMessages(false);
  }, [clearInitialScrollBlockRelease]);

  const applyMessagePagination = useCallback((page: MessagePage) => {
    const nextBefore = page.nextBefore ?? null;
    hasMoreMessagesRef.current = page.hasMore;
    nextMessageBeforeRef.current = nextBefore;
    setHasMoreMessages(page.hasMore);
  }, []);

  const getNextOptimisticMessageId = () => {
    optimisticMessageIdRef.current -= 1;
    return optimisticMessageIdRef.current;
  };

  const updateMessageInputSelection = () => {
    const input = messageInputRef.current;
    if (!input) {
      return;
    }

    messageInputSelectionRef.current = {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  };

  const clearPendingMedia = () => {
    setPendingMedia(null);
    setMediaError('');
    if (mediaFileInputRef.current) {
      mediaFileInputRef.current.value = '';
    }
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
          resetMessagePagination();
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
  }, [resetMessagePagination]);

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
      if (
        selectedRoomIdRef.current !== null &&
        !nextRooms.some((room) => room.id === selectedRoomIdRef.current)
      ) {
        selectedRoomIdRef.current = null;
        setSelectedRoom(null);
        setMessages([]);
        resetMessagePagination();
        navigate(getChatRoute(), { replace: true });
      } else {
        setSelectedRoom((currentSelectedRoom) =>
          currentSelectedRoom
            ? nextRooms.find((room) => room.id === currentSelectedRoom.id) ?? currentSelectedRoom
            : null
        );
      }
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
  }, [navigate, resetMessagePagination]);

  const loadMessages = useCallback(async (userId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      resetMessagePagination();
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<MessagePage>(`/messages/${userId}`, {
        params: { size: MESSAGE_PAGE_SIZE },
      });
      if (selectedUserIdRef.current === userId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(options.silent ? currentMessages : [], response.data.items)
        );
        if (!options.silent) {
          applyMessagePagination(response.data);
        }
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
  }, [applyMessagePagination, resetMessagePagination]);

  const loadRoomMessages = useCallback(async (roomId: number, options: LoadOptions = {}) => {
    if (!options.silent) {
      resetMessagePagination();
      setMessages([]);
      setMessagesLoading(true);
    }
    setMessagesError('');

    try {
      const response = await apiClient.get<MessagePage>(`/rooms/${roomId}/messages`, {
        params: { size: MESSAGE_PAGE_SIZE },
      });
      if (selectedRoomIdRef.current === roomId) {
        setMessages((currentMessages) =>
          mergeServerMessagesWithPending(options.silent ? currentMessages : [], response.data.items)
        );
        if (!options.silent) {
          applyMessagePagination(response.data);
        }
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
  }, [applyMessagePagination, resetMessagePagination]);

  const loadOlderMessages = useCallback(async () => {
    if (
      olderMessagesLoadingRef.current ||
      !hasMoreMessagesRef.current ||
      nextMessageBeforeRef.current === null
    ) {
      return;
    }

    const selectedUserIdForLoad = selectedUserIdRef.current;
    const selectedRoomIdForLoad = selectedRoomIdRef.current;
    if (selectedUserIdForLoad === null && selectedRoomIdForLoad === null) {
      return;
    }

    const container = messagesContainerRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;
    const before = nextMessageBeforeRef.current;

    olderMessagesLoadingRef.current = true;
    setOlderMessagesLoading(true);
    setMessagesError('');

    try {
      const response =
        selectedUserIdForLoad !== null
          ? await apiClient.get<MessagePage>(`/messages/${selectedUserIdForLoad}`, {
            params: { before, size: MESSAGE_PAGE_SIZE },
          })
          : await apiClient.get<MessagePage>(`/rooms/${selectedRoomIdForLoad}/messages`, {
            params: { before, size: MESSAGE_PAGE_SIZE },
          });

      if (
        selectedUserIdRef.current !== selectedUserIdForLoad ||
        selectedRoomIdRef.current !== selectedRoomIdForLoad
      ) {
        return;
      }

      skipNextAutoScrollRef.current = true;
      setMessages((currentMessages) =>
        mergeServerMessagesWithPending(currentMessages, response.data.items)
      );
      applyMessagePagination(response.data);

      window.requestAnimationFrame(() => {
        const currentContainer = messagesContainerRef.current;
        if (!currentContainer) {
          return;
        }

        currentContainer.scrollTop =
          currentContainer.scrollHeight - previousScrollHeight + previousScrollTop;
      });
    } catch (error) {
      console.error('Failed to load older messages:', error);
      if (
        selectedUserIdRef.current === selectedUserIdForLoad &&
        selectedRoomIdRef.current === selectedRoomIdForLoad
      ) {
        setMessagesError('Unable to load older messages.');
      }
    } finally {
      olderMessagesLoadingRef.current = false;
      setOlderMessagesLoading(false);
    }
  }, [applyMessagePagination]);

  const markMessagesScrollIntent = useCallback(() => {
    hasUserInteractedWithMessagesRef.current = true;
  }, []);

  const handleMessageAssetLoaded = useCallback(() => {
    if (
      hasUserInteractedWithMessagesRef.current ||
      (selectedUserIdRef.current === null && selectedRoomIdRef.current === null)
    ) {
      return;
    }

    forceScrollToLatestMessage();
    if (blockOlderMessagesAutoLoadRef.current) {
      releaseInitialScrollBlock();
    }
  }, [forceScrollToLatestMessage, releaseInitialScrollBlock]);

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (
      !container ||
      !hasUserInteractedWithMessagesRef.current ||
      blockOlderMessagesAutoLoadRef.current ||
      messagesLoading ||
      olderMessagesLoading ||
      container.scrollTop > LOAD_OLDER_SCROLL_THRESHOLD
    ) {
      return;
    }

    void loadOlderMessages();
  };

  useEffect(() => () => {
    clearInitialScrollBlockRelease();
  }, [clearInitialScrollBlockRelease]);

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) {
      return undefined;
    }

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
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

  useEffect(() => () => {
    if (pendingMedia?.previewUrl) {
      URL.revokeObjectURL(pendingMedia.previewUrl);
    }
  }, [pendingMedia?.previewUrl]);

  useEffect(() => {
    setEmojiPickerOpen(false);
    setReplyingToMessage(null);
    clearPendingMedia();
    setMediaUploading(false);
    setMediaViewerMessage(null);
  }, [selectedRoomId, selectedUserId]);

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }

    const handleOutsidePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        emojiPickerRef.current?.contains(target) ||
        emojiButtonRef.current?.contains(target)
      ) {
        return;
      }

      setEmojiPickerOpen(false);
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEmojiPickerOpen(false);
        messageInputRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleOutsidePointerDown);
    document.addEventListener('touchstart', handleOutsidePointerDown);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointerDown);
      document.removeEventListener('touchstart', handleOutsidePointerDown);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [emojiPickerOpen]);

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

  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const clearRemoteTypingTimeout = useCallback(() => {
    if (remoteTypingTimeoutRef.current) {
      clearTimeout(remoteTypingTimeoutRef.current);
      remoteTypingTimeoutRef.current = null;
    }
  }, []);

  const clearOptimisticSendTimeout = useCallback((clientId: string) => {
    const timeout = sendTimeoutsRef.current.get(clientId);
    if (!timeout) {
      return;
    }

    clearTimeout(timeout);
    sendTimeoutsRef.current.delete(clientId);
  }, []);

  const clearOptimisticSendTimeouts = useCallback(() => {
    sendTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    sendTimeoutsRef.current.clear();
  }, []);

  const scheduleOptimisticSendTimeout = useCallback((clientId: string) => {
    clearOptimisticSendTimeout(clientId);

    const timeout = setTimeout(() => {
      sendTimeoutsRef.current.delete(clientId);
      setMessages((currentMessages) => markOptimisticMessageFailed(currentMessages, clientId));
    }, OPTIMISTIC_SEND_TIMEOUT_MS);

    sendTimeoutsRef.current.set(clientId, timeout);
  }, [clearOptimisticSendTimeout]);

  const showRemoteTyping = useCallback((senderId: number) => {
    setTypingUserId(senderId);
    clearRemoteTypingTimeout();
    remoteTypingTimeoutRef.current = setTimeout(() => {
      setTypingUserId(null);
      remoteTypingTimeoutRef.current = null;
    }, REMOTE_TYPING_VISIBLE_MS);
  }, [clearRemoteTypingTimeout]);

  const hideRemoteTyping = useCallback(() => {
    clearRemoteTypingTimeout();
    setTypingUserId(null);
  }, [clearRemoteTypingTimeout]);

  const publishTyping = useCallback((receiverId: number, typing: boolean) => {
    wsService.sendMessage(TYPING_DESTINATION, {
      receiverId,
      typing,
    });
  }, []);

  const stopTyping = useCallback((receiverId: number) => {
    clearTypingTimeout();
    publishTyping(receiverId, false);
  }, [clearTypingTimeout, publishTyping]);

  const markConversationAsRead = useCallback(async (senderId: number) => {
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
  }, []);

  const markRoomAsRead = useCallback(async (roomId: number) => {
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
  }, []);

  const applyRoomMembershipUpdate = useCallback((room: ChatRoom) => {
    if (!isRoomParticipant(room, currentUserIdRef.current)) {
      setRooms((currentRooms) => currentRooms.filter((currentRoom) => currentRoom.id !== room.id));

      if (selectedRoomIdRef.current === room.id) {
        selectedRoomIdRef.current = null;
        setSelectedRoom(null);
        setMessages([]);
        setMessageInput('');
        setMainView('chat');
        resetMessagePagination();
        navigate(getChatRoute(), { replace: true });
      }

      return;
    }

    setRooms((currentRooms) => appendOrUpdateRoom(currentRooms, room));
    setSelectedRoom((currentSelectedRoom) =>
      currentSelectedRoom?.id === room.id ? room : currentSelectedRoom
    );
  }, [navigate, resetMessagePagination]);

  const applyMessageUpdate = useCallback((updatedMessage: Message) => {
    setMessages((currentMessages) => mergeKnownMessageUpdate(currentMessages, updatedMessage));
    setReplyingToMessage((currentReplyingMessage) =>
      currentReplyingMessage?.id === updatedMessage.id
        ? { ...currentReplyingMessage, ...toDeliveredMessage(updatedMessage) }
        : currentReplyingMessage
    );

    if (updatedMessage.chatRoomId) {
      setRooms((currentRooms) => {
        let didUpdate = false;
        const nextRooms = currentRooms.map((room) => {
          const nextRoom = applyRoomPreviewToRoom(room, updatedMessage);
          didUpdate ||= nextRoom !== room;
          return nextRoom;
        });

        return didUpdate ? sortRoomsByChatActivity(nextRooms) : currentRooms;
      });
      setSelectedRoom((currentSelectedRoom) =>
        currentSelectedRoom ? applyRoomPreviewToRoom(currentSelectedRoom, updatedMessage) : null
      );
      return;
    }

    setUsers((currentUsers) =>
      applyConversationPreviewToUsers(
        currentUsers,
        updatedMessage,
        currentUserIdRef.current,
        !userSearchQueryRef.current.trim()
      )
    );
    setFriends((currentFriends) =>
      applyConversationPreviewToUsers(currentFriends, updatedMessage, currentUserIdRef.current, true)
    );
    setSelectedUser((currentSelectedUser) =>
      currentSelectedUser
        ? applyConversationPreviewToUser(currentSelectedUser, updatedMessage, currentUserIdRef.current)
        : null
    );
  }, []);

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

          applyRoomMembershipUpdate(room);
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
        },
        (updatedMessage) => {
          if (!active) {
            return;
          }

          applyMessageUpdate(updatedMessage);
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
    clearOptimisticSendTimeout,
    clearOptimisticSendTimeouts,
    clearRemoteTypingTimeout,
    clearTypingTimeout,
    applyMessageUpdate,
    applyRoomMembershipUpdate,
    currentUser?.id,
    hideRemoteTyping,
    loadFriendSummary,
    loadIncomingFriendRequests,
    loadMessages,
    loadRoomMessages,
    loadRooms,
    loadUsers,
    markConversationAsRead,
    markRoomAsRead,
    showRemoteTyping,
  ]);

  useLayoutEffect(() => {
    if (
      (selectedUserId === null && selectedRoomId === null) ||
      messagesLoading ||
      olderMessagesLoading
    ) {
      return;
    }

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }

    const isInitialScroll = pendingInitialMessageScrollRef.current;
    if (isInitialScroll) {
      forceScrollToLatestMessage();
      pendingInitialMessageScrollRef.current = false;
      releaseInitialScrollBlock();
      return;
    }

    scrollToLatestMessage('smooth');
  }, [
    forceScrollToLatestMessage,
    releaseInitialScrollBlock,
    messages.length,
    messagesLoading,
    olderMessagesLoading,
    scrollToLatestMessage,
    selectedRoomId,
    selectedUserId,
    typingUserId,
  ]);

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

  const navigateIfNeeded = useCallback((path: string, options: { replace?: boolean } = {}) => {
    if (location.pathname !== path) {
      navigate(path, options);
    }
  }, [location.pathname, navigate]);

  const clearSelectedConversation = useCallback(() => {
    if (selectedUserIdRef.current !== null) {
      stopTyping(selectedUserIdRef.current);
    }

    selectedUserIdRef.current = null;
    selectedRoomIdRef.current = null;
    setSelectedUser(null);
    setSelectedRoom(null);
    setMainView('chat');
    resetMessagePagination();
    setMessages([]);
    setMessageInput('');
    setProfileMenuOpen(false);
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();
  }, [hideRemoteTyping, resetMessagePagination, stopTyping]);

  const activateUserConversation = useCallback((user: User) => {
    if (!canChatWithUser(user)) {
      return;
    }

    const previousSelectedUserId = selectedUserIdRef.current;
    const previousSelectedRoomId = selectedRoomIdRef.current;
    const conversationChanged = previousSelectedUserId !== user.id || previousSelectedRoomId !== null;

    if (previousSelectedUserId !== null && previousSelectedUserId !== user.id) {
      stopTyping(previousSelectedUserId);
    }

    setSelectedRoom(null);
    selectedRoomIdRef.current = null;
    setSelectedUser(user);
    selectedUserIdRef.current = user.id;
    setMainView('chat');
    setProfileMenuOpen(false);
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();

    if (conversationChanged) {
      void loadMessages(user.id);
    }
    if (conversationChanged || (user.unreadCount ?? 0) > 0) {
      void markConversationAsRead(user.id);
    }
  }, [hideRemoteTyping, loadMessages, markConversationAsRead, stopTyping]);

  const activateRoomConversation = useCallback((room: ChatRoom) => {
    const previousSelectedUserId = selectedUserIdRef.current;
    const previousSelectedRoomId = selectedRoomIdRef.current;
    const conversationChanged = previousSelectedRoomId !== room.id || previousSelectedUserId !== null;

    if (previousSelectedUserId !== null) {
      stopTyping(previousSelectedUserId);
    }

    setSelectedUser(null);
    selectedUserIdRef.current = null;
    setSelectedRoom(room);
    selectedRoomIdRef.current = room.id;
    setMainView('chat');
    setProfileMenuOpen(false);
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setDetailsOpen(shouldOpenConversationDetailsByDefault());
    hideRemoteTyping();

    if (conversationChanged) {
      void loadRoomMessages(room.id);
    }
    if (conversationChanged || (room.unreadCount ?? 0) > 0) {
      void markRoomAsRead(room.id);
    }
  }, [hideRemoteTyping, loadRoomMessages, markRoomAsRead, stopTyping]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    const routeStateForPath = parseChatRoute(location.pathname);

    if (routeStateForPath.kind === 'unknown') {
      navigate(getChatRoute(), { replace: true });
      return;
    }

    if (routeStateForPath.kind === 'chat') {
      clearSelectedConversation();
      return;
    }

    if (routeStateForPath.kind === 'friends') {
      setMainView('friends');
      setProfileMenuOpen(false);
      if (userSearchQueryRef.current) {
        userSearchQueryRef.current = '';
        setUserSearchQuery('');
        setUsersError('');
      }
      void loadUsers({ silent: true, search: '' });
      return;
    }

    if (routeStateForPath.kind === 'requests') {
      setMainView('requests');
      setProfileMenuOpen(false);
      void Promise.all([
        loadIncomingFriendRequests({ silent: true }),
        loadFriendSummary({ silent: true }),
      ]);
    }
  }, [
    clearSelectedConversation,
    currentUser?.id,
    loadFriendSummary,
    loadIncomingFriendRequests,
    loadUsers,
    location.pathname,
    navigate,
  ]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    let active = true;
    const routeStateForPath = parseChatRoute(location.pathname);
    const usernameMatches = (user: User, username: string) =>
      user.username.toLowerCase() === username.toLowerCase();

    if (routeStateForPath.kind === 'room') {
      const room = rooms.find((currentRoom) => currentRoom.id === routeStateForPath.roomId);
      if (room) {
        activateRoomConversation(room);
        return;
      }

      if (!roomsLoading) {
        navigate(getChatRoute(), { replace: true });
      }
      return;
    }

    if (routeStateForPath.kind !== 'user') {
      return;
    }

    const userFromLists =
      friends.find((friend) => usernameMatches(friend, routeStateForPath.username)) ??
      users.find((user) => usernameMatches(user, routeStateForPath.username));
    if (userFromLists) {
      if (canChatWithUser(userFromLists)) {
        activateUserConversation(userFromLists);
      } else {
        navigate(getFriendsRoute(), { replace: true });
      }
      return;
    }

    if (usersLoading && !usersError) {
      return;
    }

    apiClient
      .get<User>(`/users/${encodeURIComponent(routeStateForPath.username)}`)
      .then((response) => {
        if (!active) {
          return;
        }

        if (canChatWithUser(response.data)) {
          activateUserConversation(response.data);
        } else {
          navigate(getFriendsRoute(), { replace: true });
        }
      })
      .catch((error) => {
        console.error('Failed to resolve chat route user:', error);
        if (active) {
          navigate(getFriendsRoute(), { replace: true });
        }
      });

    return () => {
      active = false;
    };
  }, [
    activateRoomConversation,
    activateUserConversation,
    currentUser?.id,
    friends,
    location.pathname,
    navigate,
    rooms,
    roomsLoading,
    users,
    usersError,
    usersLoading,
  ]);

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

  const updateViewedProfileFromFriendship = (friendship: Friendship) => {
    setViewedProfileUser((currentProfileUser) =>
      currentProfileUser
        ? applyFriendshipToProfileUser(currentProfileUser, friendship, currentUserIdRef.current)
        : null
    );
  };

  const handleOpenRequestsPanel = () => {
    navigateIfNeeded(getRequestsRoute());
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
    setProfileActionError('');

    try {
      const response = await apiClient.post<Friendship>('/friend-requests', {
        receiverId: user.id,
      });
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to send friend request:', error);
      setUsersError('Unable to send friend request.');
      setProfileActionError('Unable to send friend request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleAcceptFriendRequest = async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true);
    setFriendRequestsError('');
    setProfileActionError('');

    try {
      const response = await apiClient.patch<Friendship>(`/friend-requests/${requestId}/accept`);
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      setFriendRequestsError('Unable to accept request.');
      setProfileActionError('Unable to accept request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleDeclineFriendRequest = async (requestId: number, actionKey: string) => {
    setFriendActionPending(actionKey, true);
    setFriendRequestsError('');
    setProfileActionError('');

    try {
      const response = await apiClient.patch<Friendship>(`/friend-requests/${requestId}/decline`);
      updateViewedProfileFromFriendship(response.data);
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      setFriendRequestsError('Unable to decline request.');
      setProfileActionError('Unable to decline request.');
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
    setProfileActionError('');

    try {
      await apiClient.delete(`/friend-requests/${user.friendshipId}`);
      setViewedProfileUser((currentProfileUser) =>
        currentProfileUser?.id === user.id
          ? { ...currentProfileUser, friendshipId: undefined, friendshipStatus: 'none' }
          : currentProfileUser
      );
      await refreshFriendshipState();
    } catch (error) {
      console.error('Failed to cancel friend request:', error);
      setUsersError('Unable to cancel friend request.');
      setProfileActionError('Unable to cancel friend request.');
    } finally {
      setFriendActionPending(actionKey, false);
    }
  };

  const handleUserSelect = (user: User) => {
    if (!canChatWithUser(user)) {
      return;
    }

    navigateIfNeeded(getUserChatRoute(user.username));
    activateUserConversation(user);
  };

  const handleRoomSelect = (room: ChatRoom) => {
    navigateIfNeeded(getRoomChatRoute(room.id));
    activateRoomConversation(room);
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

  const handleOpenUserProfile = async (user: User) => {
    const requestedUsername = user.username;
    viewedProfileUsernameRef.current = requestedUsername;
    setViewedProfileUser(user);
    setProfileActionError('');
    setViewedProfileError('');
    setViewedProfileLoading(true);
    setProfileMenuOpen(false);

    try {
      const response = await apiClient.get<User>(`/users/${encodeURIComponent(requestedUsername)}`);
      setViewedProfileUser((currentProfileUser) =>
        currentProfileUser?.username === requestedUsername
          ? { ...currentProfileUser, ...response.data }
          : currentProfileUser
      );
    } catch (error) {
      console.error('Failed to load user profile:', error);
      if (viewedProfileUsernameRef.current === requestedUsername) {
        setViewedProfileError('Unable to refresh profile.');
      }
    } finally {
      if (viewedProfileUsernameRef.current === requestedUsername) {
        setViewedProfileLoading(false);
      }
    }
  };

  const handleCloseUserProfile = () => {
    viewedProfileUsernameRef.current = '';
    setViewedProfileUser(null);
    setViewedProfileLoading(false);
    setViewedProfileError('');
    setProfileActionError('');
  };

  const handleOpenFriendsPanel = () => {
    navigateIfNeeded(getFriendsRoute());
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
    navigateIfNeeded(getChatRoute());
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
      navigateIfNeeded(getRoomChatRoute(room.id));
      setDetailsOpen(shouldOpenConversationDetailsByDefault());
      resetMessagePagination();
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

  const handleUpdateGroupSettingsName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    const name = groupSettingsName.trim();
    if (!name || name === selectedRoom.name.trim()) {
      return;
    }

    setGroupSettingsPendingAction('rename');
    setGroupSettingsError('');

    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${selectedRoom.id}`, { name });
      applyRoomMembershipUpdate(response.data);
    } catch (error) {
      console.error('Failed to update group:', error);
      setGroupSettingsError('Unable to update group.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleToggleAddRoomMember = (userId: number) => {
    setGroupSettingsError('');
    setSelectedAddMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((currentId) => currentId !== userId)
        : [...currentIds, userId]
    );
  };

  const handleAddRoomMembers = async () => {
    if (!selectedRoom || selectedAddMemberIds.length === 0 || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction('add');
    setGroupSettingsError('');

    try {
      const response = await apiClient.post<ChatRoom>(`/rooms/${selectedRoom.id}/members`, {
        participantIds: selectedAddMemberIds,
      });
      setSelectedAddMemberIds([]);
      applyRoomMembershipUpdate(response.data);
    } catch (error) {
      console.error('Failed to add group members:', error);
      setGroupSettingsError('Unable to add members.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleGroupMemberNicknameChange = (userId: number, value: string) => {
    setGroupSettingsError('');
    setGroupMemberNicknames((currentNicknames) => ({
      ...currentNicknames,
      [userId]: value,
    }));
  };

  const handleToggleGroupMemberMenu = (userId: number) => {
    setGroupSettingsError('');
    setOpenGroupMemberMenuId((currentUserId) => (currentUserId === userId ? null : userId));
  };

  const handleStartEditGroupMemberNickname = (user: User) => {
    setGroupSettingsError('');
    setOpenGroupMemberMenuId(null);
    setEditingGroupMemberNicknameId(user.id);
    setGroupMemberNicknames((currentNicknames) => ({
      ...currentNicknames,
      [user.id]: currentNicknames[user.id] ?? user.nickname ?? '',
    }));
  };

  const handleCancelEditGroupMemberNickname = (user: User) => {
    setGroupSettingsError('');
    setEditingGroupMemberNicknameId(null);
    setGroupMemberNicknames((currentNicknames) => ({
      ...currentNicknames,
      [user.id]: user.nickname ?? '',
    }));
  };

  const handleUpdateRoomMemberNickname = async (user: User) => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    const nickname = (groupMemberNicknames[user.id] ?? '').trim();
    if (nickname === (user.nickname ?? '').trim()) {
      return;
    }

    setGroupSettingsPendingAction(`nickname-${user.id}`);
    setGroupSettingsError('');

    try {
      const response = await apiClient.patch<ChatRoom>(
        `/rooms/${selectedRoom.id}/members/${user.id}/nickname`,
        { nickname }
      );
      applyRoomMembershipUpdate(response.data);
      setEditingGroupMemberNicknameId(null);
    } catch (error) {
      console.error('Failed to update group nickname:', error);
      setGroupSettingsError('Unable to update nickname.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleKickRoomMember = async (user: User) => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction(`kick-${user.id}`);
    setGroupSettingsError('');

    try {
      const response = await apiClient.delete<ChatRoom>(
        `/rooms/${selectedRoom.id}/members/${user.id}`
      );
      applyRoomMembershipUpdate(response.data);
    } catch (error) {
      console.error('Failed to remove group member:', error);
      setGroupSettingsError('Unable to remove member.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleLeaveSelectedGroup = async () => {
    if (!selectedRoom || groupSettingsSaving) {
      return;
    }

    setGroupSettingsPendingAction('leave');
    setGroupSettingsError('');

    try {
      const response = await apiClient.delete<ChatRoom>(`/rooms/${selectedRoom.id}/members/me`);
      applyRoomMembershipUpdate(response.data);
    } catch (error) {
      console.error('Failed to leave group:', error);
      setGroupSettingsError('Unable to leave group.');
    } finally {
      setGroupSettingsPendingAction(null);
    }
  };

  const handleReplyToMessage = (message: ChatMessage) => {
    if (!canUseMessageActions(message)) {
      return;
    }

    setReplyingToMessage(message);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  };

  const handleCancelReply = () => {
    setReplyingToMessage(null);
  };

  const handleCopyMessage = async (message: ChatMessage) => {
    if (!message.content?.trim() || message.recalled) {
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
    } catch (error) {
      console.error('Failed to copy message:', error);
      setMessagesError('Unable to copy message.');
    }
  };

  const handleReactToMessage = async (message: ChatMessage, emoji: string) => {
    if (!canUseMessageActions(message) || !currentUser) {
      return;
    }

    try {
      const response = hasCurrentUserReaction(message, currentUser.id, emoji)
        ? await apiClient.delete<Message>(`/messages/${message.id}/reactions`)
        : await apiClient.post<Message>(`/messages/${message.id}/reactions`, { emoji });
      applyMessageUpdate(response.data);
    } catch (error) {
      console.error('Failed to update message reaction:', error);
      setMessagesError('Unable to update reaction.');
    }
  };

  const handleRecallMessage = async (message: ChatMessage) => {
    if (!canUseMessageActions(message) || message.senderId !== currentUser?.id) {
      return;
    }

    try {
      const response = await apiClient.patch<Message>(`/messages/${message.id}/recall`);
      applyMessageUpdate(response.data);
      if (replyingToMessage?.id === message.id) {
        setReplyingToMessage(null);
      }
    } catch (error) {
      console.error('Failed to recall message:', error);
      setMessagesError('Unable to recall message.');
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

  const handleToggleEmojiPicker = () => {
    updateMessageInputSelection();
    setEmojiPickerOpen((currentOpen) => !currentOpen);
  };

  const handleInsertEmoji = (emoji: string) => {
    updateMessageInputSelection();

    const selectionStart = Math.min(messageInputSelectionRef.current.start, messageInput.length);
    const selectionEnd = Math.min(
      Math.max(messageInputSelectionRef.current.end, selectionStart),
      messageInput.length
    );
    const nextValue =
      messageInput.slice(0, selectionStart) + emoji + messageInput.slice(selectionEnd);
    const nextCursorPosition = selectionStart + emoji.length;

    messageInputSelectionRef.current = {
      start: nextCursorPosition,
      end: nextCursorPosition,
    };
    handleMessageInputChange(nextValue);

    window.requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      input.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  const handleOpenMediaPicker = () => {
    setEmojiPickerOpen(false);
    setMediaError('');
    mediaFileInputRef.current?.click();
  };

  const handleMediaFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const pendingMediaType = getPendingMediaType(file);
    if (!pendingMediaType) {
      setMediaError('Choose an image or video file.');
      event.currentTarget.value = '';
      return;
    }

    const sizeError = getMediaSizeError(file, pendingMediaType);
    if (sizeError) {
      setMediaError(sizeError);
      event.currentTarget.value = '';
      return;
    }

    setPendingMedia({
      file,
      previewUrl: URL.createObjectURL(file),
      ...pendingMediaType,
    });
    setMediaError('');
    setEmojiPickerOpen(false);
  };

  const uploadToLocalMedia = async (file: File): Promise<MediaAttachment> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.postForm<LocalMediaUploadResult>('/media/upload', formData);
    const data = response.data;

    return {
      url: getMediaUrl(data.url),
      publicId: data.publicId,
      resourceType: data.resourceType,
      format: data.format ?? getFileFormat(file),
      bytes: data.bytes ?? file.size,
    };
  };

  const uploadPendingMedia = async (media: PendingMedia): Promise<MediaAttachment> => {
    try {
      const signatureResponse = await apiClient.post<CloudinaryUploadSignature>(
        '/media/upload-signature'
      );
      const signature = signatureResponse.data;

      if (
        !signature.cloudName ||
        signature.cloudName === 'chat-app' ||
        signature.apiKey === '933935263295315'
      ) {
        return await uploadToLocalMedia(media.file);
      }

      const formData = new FormData();
      formData.append('file', media.file);
      formData.append('api_key', signature.apiKey);
      formData.append('timestamp', String(signature.timestamp));
      formData.append('signature', signature.signature);
      formData.append('folder', signature.folder);

      const uploadResponse = await fetch(signature.uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Cloudinary upload failed');
      }

      const uploadResult = (await uploadResponse.json()) as CloudinaryUploadResult;
      if (
        !uploadResult.secure_url ||
        !uploadResult.public_id ||
        uploadResult.resource_type !== media.resourceType
      ) {
        throw new Error('Cloudinary upload response is invalid');
      }

      return {
        ...cloudinaryResultToMedia(uploadResult),
        format: uploadResult.format ?? getFileFormat(media.file),
        bytes: uploadResult.bytes ?? media.file.size,
      };
    } catch {
      return await uploadToLocalMedia(media.file);
    }
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
    const mediaToSend = pendingMedia;
    if (
      (!content && !mediaToSend) ||
      mediaUploading ||
      !currentUser ||
      (!selectedUser && !selectedRoom)
    ) {
      return;
    }

    let mediaPayload: MediaAttachment | undefined;
    const messageType: MessageType = mediaToSend ? mediaToSend.type : 'TEXT';
    const replyTo = createReplyFromMessage(replyingToMessage);
    const replyToMessageId = replyTo?.id;
    if (mediaToSend) {
      setMediaUploading(true);
      setMediaError('');
      try {
        mediaPayload = await uploadPendingMedia(mediaToSend);
      } catch (error) {
        console.error('Failed to upload media:', error);
        setMediaError('Unable to upload media. Please try again.');
        setMediaUploading(false);
        return;
      }
      setMediaUploading(false);
    }

    const clientId = createClientId();
    setMessagesError('');
    setMessageInput('');
    setEmojiPickerOpen(false);
    setReplyingToMessage(null);
    clearPendingMedia();

    if (selectedUser) {
      const optimisticMessage = createOptimisticMessage(
        getNextOptimisticMessageId(),
        currentUser.id,
        selectedUser.id,
        content,
        clientId,
        messageType,
        mediaPayload,
        replyTo
      );
      const payload = {
        receiverId: selectedUser.id,
        content,
        clientId,
        replyToMessageId,
        type: messageType,
        media: mediaPayload,
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
        clientId,
        messageType,
        mediaPayload,
        replyTo
      );
      const payload = {
        content,
        clientId,
        replyToMessageId,
        type: messageType,
        media: mediaPayload,
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
        replyToMessageId: message.replyTo?.id,
        type: getMessageType(message),
        media: getMediaPayloadFromMessage(message),
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
      replyToMessageId: message.replyTo?.id,
      type: getMessageType(message),
      media: getMediaPayloadFromMessage(message),
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
    setProfileBio(currentUser?.bio ?? '');
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
    setProfileBio('');
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

    if (profileBio.trim().length > BIO_MAX_LENGTH) {
      setProfileError(`Bio must be ${BIO_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('bio', profileBio.trim());
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
      setProfileBio('');
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
  const refreshedViewedProfileUser = viewedProfileUser
    ? users.find((user) => user.id === viewedProfileUser.id) ??
    friends.find((friend) => friend.id === viewedProfileUser.id) ??
    (selectedUser?.id === viewedProfileUser.id ? selectedUser : undefined) ??
    selectedRoom?.participants.find((participant) => participant.id === viewedProfileUser.id)
    : undefined;
  const activeViewedProfileUser = viewedProfileUser
    ? mergeViewedProfileUser(viewedProfileUser, refreshedViewedProfileUser)
    : null;
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
  const selectedRoomOwnerId = selectedRoom?.ownerId ?? null;
  const selectedRoomOwner = selectedRoom?.participants.find(
    (participant) => participant.id === selectedRoomOwnerId
  );
  const selectedRoomOwnerName =
    getUserDisplayName(selectedRoomOwner ?? null) ||
    selectedRoom?.ownerFullName?.trim() ||
    selectedRoom?.ownerUsername ||
    '';
  const currentUserCanManageSelectedRoom =
    Boolean(selectedRoom && currentUser && selectedRoomOwnerId === currentUser.id);
  const groupSettingsSaving = groupSettingsPendingAction !== null;
  const selectedRoomParticipantIds = new Set(
    selectedRoom?.participants.map((participant) => participant.id) ?? []
  );
  const addMemberCandidates = friends.filter(
    (friend) => !selectedRoomParticipantIds.has(friend.id)
  );
  const canSaveGroupSettingsName = Boolean(
    currentUserCanManageSelectedRoom &&
    groupSettingsName.trim() &&
    selectedRoom &&
    groupSettingsName.trim() !== selectedRoom.name.trim() &&
    !groupSettingsSaving
  );
  const canAddRoomMembers = Boolean(
    currentUserCanManageSelectedRoom &&
    selectedAddMemberIds.length > 0 &&
    !groupSettingsSaving
  );
  const canKickSelectedRoomMember = Boolean(
    currentUserCanManageSelectedRoom &&
    selectedRoom &&
    selectedRoom.participants.length > MIN_GROUP_MEMBERS &&
    !groupSettingsSaving
  );
  const sidebarBusy = hasUserSearch ? usersLoading : usersLoading || roomsLoading;
  const messageListItems = buildMessageListItems(messages, selectedRoom, currentUser?.id ?? null);
  const mediaViewerUrl = getMediaUrl(mediaViewerMessage?.mediaUrl);
  const activeReplyPreview = createReplyFromMessage(replyingToMessage);

  const renderReplyQuote = (reply?: MessageReply | null) => {
    if (!reply) {
      return null;
    }

    return (
      <div className="message-reply-quote">
        <span>{reply.senderName}</span>
        <p>{reply.recalled ? 'Message recalled' : reply.content || 'Message'}</p>
      </div>
    );
  };

  const renderMessageReactions = (message: ChatMessage) => {
    const groupedReactions = getGroupedMessageReactions(message, currentUser?.id ?? null);
    if (groupedReactions.length === 0) {
      return null;
    }

    return (
      <div className="message-reactions" aria-label="Message reactions">
        {groupedReactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            className={`message-reaction-pill ${reaction.reactedByCurrentUser ? 'active' : ''}`}
            onClick={() => void handleReactToMessage(message, reaction.emoji)}
            title={reaction.title}
            aria-label={`${reaction.count} ${reaction.emoji} reactions`}
          >
            <span>{reaction.emoji}</span>
            {reaction.count > 1 ? <small>{reaction.count}</small> : null}
          </button>
        ))}
      </div>
    );
  };

  const renderMessageActions = (message: ChatMessage, isSentByCurrentUser: boolean) => {
    if (!canUseMessageActions(message)) {
      return null;
    }

    const currentUserId = currentUser?.id ?? null;
    const canCopyMessage = Boolean(message.content?.trim());

    return (
      <div className="message-actions" aria-label="Message actions">
        <div className="message-quick-reactions">
          {QUICK_REACTION_EMOJIS.map((emoji) => (
            <button
              key={`${message.id}-${emoji}`}
              type="button"
              className={`message-action-btn reaction ${hasCurrentUserReaction(message, currentUserId, emoji) ? 'active' : ''}`}
              onClick={() => void handleReactToMessage(message, emoji)}
              aria-label={`React with ${emoji}`}
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="message-action-btn"
          onClick={() => handleReplyToMessage(message)}
          aria-label="Reply"
          title="Reply"
        >
          <ReplyIcon className="message-action-icon" />
        </button>
        {canCopyMessage ? (
          <button
            type="button"
            className="message-action-btn"
            onClick={() => void handleCopyMessage(message)}
            aria-label="Copy"
            title="Copy"
          >
            <CopyIcon className="message-action-icon" />
          </button>
        ) : null}
        {isSentByCurrentUser ? (
          <button
            type="button"
            className="message-action-btn danger"
            onClick={() => void handleRecallMessage(message)}
            aria-label="Recall"
            title="Recall"
          >
            <RecallIcon className="message-action-icon" />
          </button>
        ) : null}
      </div>
    );
  };

  const renderMessageBody = (message: ChatMessage) => {
    const mediaUrl = getMediaUrl(message.mediaUrl);

    if (message.recalled) {
      return (
        <div className="message-content recalled">
          <span>Message recalled</span>
        </div>
      );
    }

    if (getMessageType(message) === 'IMAGE' && mediaUrl) {
      return (
        <div className="message-media-content">
          {renderReplyQuote(message.replyTo)}
          <button
            type="button"
            className="message-image-preview-btn"
            onClick={() => setMediaViewerMessage(message)}
            aria-label="Open image preview"
          >
            <img
              src={mediaUrl}
              alt={message.content || 'Shared image'}
              onLoad={handleMessageAssetLoaded}
              onError={handleMessageAssetLoaded}
            />
          </button>
          {message.content ? (
            <div className="message-media-caption">{renderLinkedText(message.content)}</div>
          ) : null}
        </div>
      );
    }

    if (getMessageType(message) === 'VIDEO' && mediaUrl) {
      return (
        <div className="message-media-content">
          {renderReplyQuote(message.replyTo)}
          <video
            className="message-video-preview"
            src={mediaUrl}
            controls
            preload="metadata"
            onLoadedMetadata={handleMessageAssetLoaded}
            onError={handleMessageAssetLoaded}
          />
          {message.content ? (
            <div className="message-media-caption">{renderLinkedText(message.content)}</div>
          ) : null}
        </div>
      );
    }

    return (
      <div className={`message-content ${hasLinkPreview(message.linkPreview) ? 'has-link-preview' : ''}`}>
        {renderReplyQuote(message.replyTo)}
        {message.content ? (
          <div className="message-text">{renderLinkedText(message.content)}</div>
        ) : null}
        {renderLinkPreviewCard(message.linkPreview, handleMessageAssetLoaded)}
      </div>
    );
  };

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
            onClick={(event) => {
              event.stopPropagation();
              void handleAcceptFriendRequest(requestId, `accept-user-${user.id}`);
            }}
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
              onClick={(event) => {
                event.stopPropagation();
                void handleCancelFriendRequest(user);
              }}
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
            onClick={(event) => {
              event.stopPropagation();
              void handleSendFriendRequest(user);
            }}
          >
            Add
          </button>
        );
      case 'accepted':
      default:
        return <span className="friend-status-pill accepted">Friend</span>;
    }
  };

  const renderProfileAction = (user: User) => {
    switch (user.friendshipStatus) {
      case 'accepted':
        return (
          <button
            type="button"
            className="send-btn profile-message-btn"
            onClick={() => handleUserSelect(user)}
          >
            Message
          </button>
        );
      case 'pending_incoming': {
        const requestId = user.friendshipId;
        return requestId ? (
          <>
            <button
              type="button"
              className="friend-action-btn"
              disabled={friendActionKeys.includes(`accept-profile-${user.id}`)}
              onClick={() =>
                void handleAcceptFriendRequest(requestId, `accept-profile-${user.id}`)
              }
            >
              Accept
            </button>
            <button
              type="button"
              className="friend-action-btn secondary"
              disabled={friendActionKeys.includes(`decline-profile-${user.id}`)}
              onClick={() =>
                void handleDeclineFriendRequest(requestId, `decline-profile-${user.id}`)
              }
            >
              Decline
            </button>
          </>
        ) : null;
      }
      case 'pending_outgoing':
        return (
          <>
            <span className="friend-status-pill">Pending</span>
            <button
              type="button"
              className="friend-action-btn secondary"
              disabled={!user.friendshipId || friendActionKeys.includes(`cancel-${user.id}`)}
              onClick={() => void handleCancelFriendRequest(user)}
            >
              Cancel
            </button>
          </>
        );
      case 'declined':
      case 'none':
      case undefined:
      default:
        return (
          <button
            type="button"
            className="friend-action-btn"
            disabled={friendActionKeys.includes(`send-${user.id}`)}
            onClick={() => void handleSendFriendRequest(user)}
          >
            Add friend
          </button>
        );
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
      <div key={user.id} className="user-item relationship-item profile-result-item">
        <button
          type="button"
          className="profile-result-trigger"
          onClick={() => void handleOpenUserProfile(user)}
          aria-label={`View profile for ${getUserDisplayName(user)}`}
        >
          {renderUserIdentity(user)}
        </button>
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
        <span>@{user.username}</span>
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
    const isOwner = user.id === selectedRoomOwnerId;
    const memberDisplayName = getUserDisplayName(user);
    const accountDisplayName = getUserAccountDisplayName(user);
    const nicknameValue = groupMemberNicknames[user.id] ?? '';
    const normalizedNicknameValue = nicknameValue.trim();
    const normalizedSavedNickname = (user.nickname ?? '').trim();
    const nicknameChanged = normalizedNicknameValue !== normalizedSavedNickname;
    const nicknamePending = groupSettingsPendingAction === `nickname-${user.id}`;
    const kickPending = groupSettingsPendingAction === `kick-${user.id}`;
    const canKickMember = canKickSelectedRoomMember && !isOwner && !isCurrentUser;
    const memberMenuOpen = openGroupMemberMenuId === user.id;
    const editingNickname = editingGroupMemberNicknameId === user.id;
    const presenceLabel = isCurrentUser
      ? `You - ${getPresenceLabel(user)}`
      : getPresenceLabel(user);

    return (
      <div
        key={user.id}
        className={`details-member-item ${editingNickname ? 'editing' : ''}`}
      >
        {renderUserAvatar(user, 'user-avatar small-avatar')}
        <div className="details-member-copy">
          <div className="details-member-title">
            <strong>{memberDisplayName}</strong>
            {isOwner ? <span className="details-owner-badge">Owner</span> : null}
          </div>
          {shouldShowUsername(user) ? <span>@{user.username}</span> : null}
          <span className={`details-presence ${user.online ? 'online' : 'offline'}`}>
            {presenceLabel}
          </span>
        </div>

        {currentUserCanManageSelectedRoom ? (
          <div className="details-member-menu-wrap">
            <button
              type="button"
              className="details-member-menu-btn"
              disabled={groupSettingsSaving}
              onClick={() => handleToggleGroupMemberMenu(user.id)}
              aria-haspopup="menu"
              aria-expanded={memberMenuOpen}
              aria-label={`Member actions for ${memberDisplayName}`}
              title="Member actions"
            >
              <MoreIcon className="details-member-menu-icon" />
            </button>

            {memberMenuOpen ? (
              <div className="details-member-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleStartEditGroupMemberNickname(user)}
                >
                  Rename nickname
                </button>
                {!isOwner && !isCurrentUser ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={!canKickMember}
                    onClick={() => void handleKickRoomMember(user)}
                  >
                    {kickPending ? 'Kicking' : 'Kick member'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {editingNickname ? (
          <div className="details-member-editor">
            <input
              type="text"
              value={nicknameValue}
              placeholder={accountDisplayName}
              maxLength={80}
              disabled={groupSettingsSaving}
              autoComplete="off"
              spellCheck={false}
              aria-label={`Nickname for ${accountDisplayName}`}
              onChange={(event) =>
                handleGroupMemberNicknameChange(user.id, event.target.value)
              }
            />
            <div className="details-member-editor-actions">
              <button
                type="button"
                className="details-small-action-btn"
                disabled={!nicknameChanged || groupSettingsSaving}
                onClick={() => void handleUpdateRoomMemberNickname(user)}
              >
                {nicknamePending ? 'Saving' : 'Save'}
              </button>
              <button
                type="button"
                className="details-small-action-btn secondary"
                disabled={groupSettingsSaving}
                onClick={() => handleCancelEditGroupMemberNickname(user)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
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
              {getPresenceLabel(selectedUser)}
            </span>
            {selectedUser.bio?.trim() ? <p className="details-bio">{selectedUser.bio}</p> : null}
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

          <section className="details-section" aria-labelledby="group-settings-title">
            <div className="details-section-heading">
              <h4 id="group-settings-title">Group</h4>
              {currentUserCanManageSelectedRoom ? <span>Owner</span> : null}
            </div>

            {currentUserCanManageSelectedRoom ? (
              <form className="details-management-form" onSubmit={handleUpdateGroupSettingsName}>
                <label className="details-field">
                  <span>Group name</span>
                  <input
                    type="text"
                    value={groupSettingsName}
                    onChange={(event) => {
                      setGroupSettingsError('');
                      setGroupSettingsName(event.target.value);
                    }}
                    maxLength={100}
                    disabled={groupSettingsSaving}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button
                  type="submit"
                  className="details-action-btn"
                  disabled={!canSaveGroupSettingsName}
                >
                  {groupSettingsPendingAction === 'rename' ? 'Saving' : 'Save'}
                </button>
              </form>
            ) : (
              <div className="details-row">
                <span>Owner</span>
                <strong>{selectedRoomOwnerName || 'Group owner'}</strong>
              </div>
            )}

            {groupSettingsError ? (
              <div className="details-error">{groupSettingsError}</div>
            ) : null}
          </section>

          {currentUserCanManageSelectedRoom ? (
            <section className="details-section" aria-labelledby="add-members-title">
              <div className="details-section-heading">
                <h4 id="add-members-title">Add members</h4>
                {selectedAddMemberIds.length > 0 ? <span>{selectedAddMemberIds.length}</span> : null}
              </div>

              {addMemberCandidates.length === 0 ? (
                <div className="details-empty-text">All friends are already in this group.</div>
              ) : (
                <div className="details-add-member-list">
                  {addMemberCandidates.map((friend) => (
                    <label key={friend.id} className="details-add-member-option">
                      <input
                        type="checkbox"
                        checked={selectedAddMemberIds.includes(friend.id)}
                        disabled={groupSettingsSaving}
                        onChange={() => handleToggleAddRoomMember(friend.id)}
                      />
                      {renderUserAvatar(friend, 'user-avatar small-avatar')}
                      <span className="details-add-member-copy">
                        <strong>{getUserDisplayName(friend)}</strong>
                        <small>@{friend.username}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="details-action-btn"
                disabled={!canAddRoomMembers}
                onClick={() => void handleAddRoomMembers()}
              >
                {groupSettingsPendingAction === 'add' ? 'Adding' : 'Add'}
              </button>
            </section>
          ) : null}

          <section className="details-section" aria-labelledby="group-members-title">
            <div className="details-section-heading">
              <h4 id="group-members-title">Members</h4>
              <span>{selectedRoom.participants.length}</span>
            </div>
            <div className="details-member-list">
              {sortedParticipants.map(renderDetailsMemberItem)}
            </div>
          </section>

          <section className="details-section details-danger-zone" aria-labelledby="leave-group-title">
            <h4 id="leave-group-title">Leave group</h4>
            <button
              type="button"
              className="details-action-btn danger"
              disabled={groupSettingsSaving}
              onClick={() => void handleLeaveSelectedGroup()}
            >
              {groupSettingsPendingAction === 'leave' ? 'Leaving' : 'Leave group'}
            </button>
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
                      </div>
                    ) : selectedUser ? (
                      <div className="user-meta">
                        <span className={`user-status ${selectedUser.online ? 'online' : 'offline'}`}>
                          {getPresenceLabel(selectedUser)}
                        </span>
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

              <div
                ref={messagesContainerRef}
                className="messages-container"
                aria-busy={messagesLoading || olderMessagesLoading}
                onPointerDown={markMessagesScrollIntent}
                onScroll={handleMessagesScroll}
                onTouchMove={markMessagesScrollIntent}
                onWheel={markMessagesScrollIntent}
              >
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
                  <>
                    {hasMoreMessages ? (
                      <button
                        type="button"
                        className="older-messages-btn"
                        onClick={() => void loadOlderMessages()}
                        disabled={olderMessagesLoading}
                      >
                        {olderMessagesLoading ? 'Loading older messages...' : 'Load older messages'}
                      </button>
                    ) : null}
                    {messageListItems.map((item) => {
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
                          <div className="message-bubble-row">
                            {isSentByCurrentUser ? renderMessageActions(message, isSentByCurrentUser) : null}
                            <div className="message-bubble-wrap">
                              {renderMessageBody(message)}
                              {renderMessageReactions(message)}
                            </div>
                            {!isSentByCurrentUser ? renderMessageActions(message, isSentByCurrentUser) : null}
                          </div>
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
                    })}
                  </>
                )}
                {!messagesLoading && selectedUser && typingUserId === selectedUser.id ? (
                  <div className="typing-indicator">
                    {getUserDisplayName(selectedUser)} is typing...
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="message-input-form">
                <input
                  ref={mediaFileInputRef}
                  type="file"
                  className="media-file-input"
                  accept={MEDIA_ACCEPT}
                  onChange={handleMediaFileChange}
                />

                {activeReplyPreview ? (
                  <div className="replying-composer-preview">
                    <div className="replying-composer-copy">
                      <span>Replying to {activeReplyPreview.senderName}</span>
                      <p>{activeReplyPreview.content}</p>
                    </div>
                    <button
                      type="button"
                      className="replying-composer-close"
                      onClick={handleCancelReply}
                      aria-label="Cancel reply"
                      title="Cancel reply"
                    >
                      <CloseIcon className="replying-composer-close-icon" />
                    </button>
                  </div>
                ) : null}

                {pendingMedia || mediaError ? (
                  <div className="pending-media-wrap">
                    {pendingMedia ? (
                      <div className="pending-media-preview">
                        {pendingMedia.resourceType === 'image' ? (
                          <img src={pendingMedia.previewUrl} alt="Selected media preview" />
                        ) : (
                          <video src={pendingMedia.previewUrl} muted preload="metadata" />
                        )}
                        <div className="pending-media-copy">
                          <strong>{pendingMedia.file.name}</strong>
                          <span>{mediaUploading ? 'Uploading...' : 'Ready to send'}</span>
                        </div>
                        <button
                          type="button"
                          className="pending-media-remove"
                          onClick={clearPendingMedia}
                          disabled={mediaUploading}
                          aria-label="Remove selected media"
                        >
                          <CloseIcon className="pending-media-remove-icon" />
                        </button>
                      </div>
                    ) : null}
                    {mediaError ? <div className="media-error-text">{mediaError}</div> : null}
                  </div>
                ) : null}

                <div className="message-input-row">
                  <div className="message-composer">
                    <button
                      type="button"
                      className="composer-icon-btn"
                      onClick={handleOpenMediaPicker}
                      disabled={mediaUploading}
                      aria-label="Attach image or video"
                      title="Attach media"
                    >
                      <MediaIcon className="composer-icon" />
                    </button>
                    <button
                      ref={emojiButtonRef}
                      type="button"
                      className={`composer-icon-btn emoji-toggle-btn ${emojiPickerOpen ? 'active' : ''}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleToggleEmojiPicker}
                      disabled={mediaUploading}
                      aria-label={emojiPickerOpen ? 'Close emoji picker' : 'Open emoji picker'}
                      aria-expanded={emojiPickerOpen}
                      aria-controls="emoji-picker-panel"
                      aria-haspopup="dialog"
                      title="Emoji"
                    >
                      <EmojiIcon className="composer-icon" />
                    </button>
                    <textarea
                      ref={messageInputRef}
                      value={messageInput}
                      onChange={(e) => handleMessageInputChange(e.target.value)}
                      onKeyDown={handleMessageInputKeyDown}
                      onKeyUp={updateMessageInputSelection}
                      onClick={updateMessageInputSelection}
                      onSelect={updateMessageInputSelection}
                      placeholder={`Message ${selectedConversationName}`}
                      className="message-input"
                      rows={1}
                      disabled={mediaUploading}
                    />

                    {emojiPickerOpen ? (
                      <div
                        ref={emojiPickerRef}
                        id="emoji-picker-panel"
                        className="emoji-picker-panel"
                        role="dialog"
                        aria-label="Emoji picker"
                      >
                        <div className="emoji-picker-header">Emoji</div>
                        <div className="emoji-category-list">
                          {EMOJI_CATEGORIES.map((category) => (
                            <section key={category.name} className="emoji-category">
                              <div className="emoji-category-title">{category.name}</div>
                              <div className="emoji-grid">
                                {category.emojis.map((emoji) => (
                                  <button
                                    key={`${category.name}-${emoji.symbol}`}
                                    type="button"
                                    className="emoji-option-btn"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleInsertEmoji(emoji.symbol)}
                                    aria-label={`Insert ${emoji.label}`}
                                    title={emoji.label}
                                  >
                                    {emoji.symbol}
                                  </button>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    className="send-btn"
                    disabled={(!messageInput.trim() && !pendingMedia) || mediaUploading}
                  >
                    {mediaUploading ? 'Uploading' : 'Send'}
                  </button>
                </div>
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

      {mediaViewerUrl ? (
        <div
          className="modal-backdrop media-viewer-backdrop"
          onClick={() => setMediaViewerMessage(null)}
        >
          <div
            className="media-viewer-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="media-viewer-close"
              onClick={() => setMediaViewerMessage(null)}
              aria-label="Close image preview"
            >
              <CloseIcon className="media-viewer-close-icon" />
            </button>
            <img
              src={mediaViewerUrl}
              alt={mediaViewerMessage?.content || 'Shared image preview'}
            />
            {mediaViewerMessage?.content ? (
              <div className="media-viewer-caption">{mediaViewerMessage.content}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeViewedProfileUser ? (
        <div className="modal-backdrop">
          <div
            className="user-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-profile-title"
          >
            <div className="user-profile-header">
              <span>Profile</span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseUserProfile}
                aria-label="Close user profile"
              >
                ×
              </button>
            </div>

            <div className="user-profile-body">
              {renderUserAvatar(activeViewedProfileUser, 'user-avatar profile-view-avatar')}
              <div className="user-profile-copy">
                <h3 id="view-profile-title">{getUserDisplayName(activeViewedProfileUser)}</h3>
                <span>@{activeViewedProfileUser.username}</span>
              </div>
              {activeViewedProfileUser.bio?.trim() ? (
                <p className="profile-bio">{activeViewedProfileUser.bio}</p>
              ) : null}
              {viewedProfileLoading ? <div className="profile-loading">Refreshing profile...</div> : null}
              {viewedProfileError ? <div className="profile-action-error">{viewedProfileError}</div> : null}

              <div className="profile-info-grid">
                <div className="profile-info-item">
                  <span>Status</span>
                  <strong className={activeViewedProfileUser.online ? 'online' : 'offline'}>
                    {getPresenceLabel(activeViewedProfileUser)}
                  </strong>
                </div>
                <div className="profile-info-item">
                  <span>Relationship</span>
                  <strong>{getRelationshipLabel(activeViewedProfileUser)}</strong>
                </div>
              </div>

              <div className="profile-action-row">
                {renderProfileAction(activeViewedProfileUser)}
              </div>
              {profileActionError ? (
                <div className="profile-action-error">{profileActionError}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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

              <label className="group-field">
                <span>Bio</span>
                <textarea
                  value={profileBio}
                  onChange={(event) => {
                    setProfileBio(event.target.value);
                    setProfileError('');
                  }}
                  placeholder="Write a short status"
                  maxLength={BIO_MAX_LENGTH}
                  rows={3}
                  disabled={profileSaving}
                />
                <small className="profile-bio-count">
                  {profileBio.trim().length}/{BIO_MAX_LENGTH}
                </small>
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
