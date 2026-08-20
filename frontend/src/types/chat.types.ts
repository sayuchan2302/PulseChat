/**
 * Local types used exclusively within the ChatPage feature.
 * These augment the shared types in src/types/index.ts.
 */
import type { CallType, Message, MessageType, MediaAttachment, User, ChatRoom } from './index';
export type { CallType, Message, MessageType, MediaAttachment, User, ChatRoom };

// ─── Delivery & Message ────────────────────────────────────────────────────────

export type DeliveryStatus = 'sending' | 'sent' | 'failed';

export type ChatMessage = Message & {
    deliveryStatus?: DeliveryStatus;
};

// ─── WebRTC / Call ────────────────────────────────────────────────────────────

export type ActiveCall = {
    callId?: number;
    type: CallType;
    status: 'ringing' | 'connecting' | 'connected' | 'ending';
    direction: 'incoming' | 'outgoing';
    peer: User;
};

export type CallConnectionState =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'failed'
    | 'closed';

export type CallPermissionStatus = PermissionState | 'unsupported' | 'unknown';

export type CallPermissionSnapshot = {
    microphone: CallPermissionStatus;
    camera: CallPermissionStatus;
};

export type PreCallSetup = {
    type: CallType;
    target: User;
} | null;

// ─── Message Payloads ─────────────────────────────────────────────────────────

export type SendMessagePayload = {
    receiverId: number;
    content: string;
    clientId: string;
    replyToMessageId?: number;
    type?: MessageType;
    media?: MediaAttachment;
};

export type SendRoomMessagePayload = {
    content: string;
    clientId: string;
    replyToMessageId?: number;
    type?: MessageType;
    media?: MediaAttachment;
};

// ─── Media ───────────────────────────────────────────────────────────────────

export type PendingMedia = {
    file: File;
    previewUrl: string;
    type: Extract<MessageType, 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE'>;
    resourceType: 'image' | 'video' | 'raw';
    mediaDuration?: number;
};

export type CloudinaryUploadResult = {
    secure_url: string;
    public_id: string;
    resource_type: 'image' | 'video' | 'raw';
    format?: string;
    bytes?: number;
    width?: number;
    height?: number;
    duration?: number;
};

export type LocalMediaUploadResult = {
    url: string;
    publicId: string;
    resourceType: 'image' | 'video' | 'raw';
    format?: string;
    bytes?: number;
    duration?: number;
};

// ─── Loading ──────────────────────────────────────────────────────────────────

export type LoadOptions = {
    silent?: boolean;
    search?: string;
};

export type SharedContentLoadOptions = {
    reset?: boolean;
};

export type SharedContentPredicate = (message: Message) => boolean;

export type MessageSearchLoadOptions = {
    reset?: boolean;
    query?: string;
};

// ─── UI State ─────────────────────────────────────────────────────────────────

export type MainView = 'chat' | 'friends' | 'requests';
export type ConversationFilter = 'all' | 'unread' | 'archived';
export type SharedContentKind = 'media' | 'links';

// ─── Routing ─────────────────────────────────────────────────────────────────

export type ChatRouteState =
    | { kind: 'chat' }
    | { kind: 'friends' }
    | { kind: 'requests' }
    | { kind: 'user'; username: string }
    | { kind: 'room'; roomId: number }
    | { kind: 'unknown' };

// ─── Icon Props ───────────────────────────────────────────────────────────────

export type HeaderIconProps = {
    className?: string;
};

// ─── Message List Items ───────────────────────────────────────────────────────

export type MessageDateDividerItem = {
    type: 'date';
    key: string;
    label: string;
};

export type MessageUnreadDividerItem = {
    type: 'unread';
    key: string;
};

export type MessageBubbleItem = {
    type: 'message';
    key: string;
    message: ChatMessage;
    groupedWithPrevious: boolean;
    groupedWithNext: boolean;
    showSender: boolean;
};

export type MessageListItem =
    | MessageDateDividerItem
    | MessageUnreadDividerItem
    | MessageBubbleItem;

// ─── Conversation ─────────────────────────────────────────────────────────────

export type SidebarConversationItem =
    | { type: 'user'; user: User }
    | { type: 'room'; room: import('./index').ChatRoom };

export type ConversationTarget =
    | { type: 'user'; user: User }
    | { type: 'room'; room: import('./index').ChatRoom };

export type PendingReadConversation =
    | { type: 'user'; id: number; unreadCount: number }
    | { type: 'room'; id: number; unreadCount: number }
    | null;

export type MentionCandidate = {
    id: number | 'all';
    username: string;
    fullName: string;
    isAll?: boolean;
};

// ─── Notifications ────────────────────────────────────────────────────────────

export type ChatBrowserNotification = {
    title: string;
    body: string;
    path?: string;
    user?: User | null;
    browserTag: string;
    isMention?: boolean;
};
