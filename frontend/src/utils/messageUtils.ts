/**
 * Message manipulation utilities.
 * Pure functions — no React, no side effects.
 */
import type {
    ChatMessage,
    DeliveryStatus,
    PendingMedia,
    CloudinaryUploadResult,
    SharedContentPredicate,
    MessageListItem,
    MessageBubbleItem,
} from '../types/chat.types';
import type {
    Message,
    MessageType,
    MediaAttachment,
    MessageReply,
    ReadReceiptEvent,
    User,
    ChatRoom,
} from '../types';
import { MESSAGE_GROUP_THRESHOLD_MS, READ_BOTTOM_THRESHOLD } from '../constants/chatConstants';
import { getTimestampValue, getLocalDateKey } from './formatUtils';
import { getUserDisplayName } from './userUtils';

// ─── DOM / Scroll helpers ─────────────────────────────────────────────────────

export function isMessagesContainerNearBottom(container: HTMLElement | null, threshold = READ_BOTTOM_THRESHOLD) {
    if (!container) return false;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance <= threshold;
}

export function getMessagesContainerBottomScrollTop(container: HTMLElement | null) {
    if (!container) return 0;
    return Math.max(0, container.scrollHeight - container.clientHeight);
}

// ─── Basic conversion ─────────────────────────────────────────────────────────

export function toDeliveredMessage(message: Message): ChatMessage {
    return { ...message, deliveryStatus: 'sent' };
}

export function getMessageTimestampValue(message: ChatMessage) {
    const v = Date.parse(message.timestamp);
    return Number.isNaN(v) ? 0 : v;
}

export function sortMessagesByTimeline(messages: ChatMessage[]) {
    return [...messages].sort((a, b) => {
        const delta = getMessageTimestampValue(a) - getMessageTimestampValue(b);
        return delta !== 0 ? delta : a.id - b.id;
    });
}

// ─── Append / reconcile ───────────────────────────────────────────────────────

export function appendOrReconcileMessage(messages: ChatMessage[], incoming: Message) {
    const delivered = toDeliveredMessage(incoming);
    const existingIdx = messages.findIndex((m) => m.id === incoming.id);
    if (existingIdx >= 0) {
        return messages.map((m, i) => (i === existingIdx ? { ...m, ...delivered } : m));
    }
    if (incoming.clientId) {
        const optimisticIdx = messages.findIndex((m) => m.clientId === incoming.clientId);
        if (optimisticIdx >= 0) {
            return messages.map((m, i) => (i === optimisticIdx ? delivered : m));
        }
    }
    return [...messages, delivered];
}

export function mergeKnownMessageUpdate(messages: ChatMessage[], incoming: Message) {
    const delivered = toDeliveredMessage(incoming);
    const idx = messages.findIndex((m) => m.id === incoming.id);
    if (idx < 0) return messages;
    return messages.map((m, i) => (i === idx ? { ...m, ...delivered } : m));
}

export function appendOptimisticMessage(messages: ChatMessage[], optimistic: ChatMessage) {
    return messages.some((m) => m.clientId === optimistic.clientId)
        ? messages
        : [...messages, optimistic];
}

export function mergeServerMessagesWithPending(current: ChatMessage[], serverMessages: Message[]) {
    const merged = [...current];
    serverMessages.map(toDeliveredMessage).forEach((delivered) => {
        const existingIdx = merged.findIndex((m) => m.id === delivered.id);
        if (existingIdx >= 0) { merged[existingIdx] = { ...merged[existingIdx], ...delivered }; return; }
        if (delivered.clientId) {
            const optimisticIdx = merged.findIndex((m) => m.clientId === delivered.clientId);
            if (optimisticIdx >= 0) { merged[optimisticIdx] = delivered; return; }
        }
        merged.push(delivered);
    });
    return sortMessagesByTimeline(merged);
}

// ─── Active conversation checks ───────────────────────────────────────────────

export function isConversationMessage(
    message: Message,
    currentUserId: number | null,
    selectedUserId: number | null
) {
    if (selectedUserId === null) return false;
    return getPrivateConversationUserId(message, currentUserId) === selectedUserId;
}

export function isActiveConversationMessage(
    message: Message,
    currentUserId: number | null,
    selectedUserId: number | null,
    selectedRoomId: number | null
) {
    if (message.chatRoomId) return selectedRoomId === message.chatRoomId;
    return isConversationMessage(message, currentUserId, selectedUserId);
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

export function getMessageType(message: Message): MessageType {
    return message.type ?? 'TEXT';
}

export function isMediaMessage(message: Message) {
    const t = getMessageType(message);
    return t === 'IMAGE' || t === 'VIDEO' || t === 'AUDIO' || t === 'FILE';
}

export function isCallMessage(message: Message) {
    return getMessageType(message) === 'CALL';
}

// ─── Read receipt ─────────────────────────────────────────────────────────────

export function applyReadReceipt(messages: ChatMessage[], receipt: ReadReceiptEvent) {
    return messages.map((m) =>
        m.id > 0 && m.senderId === receipt.senderId && m.receiverId === receipt.readerId
            ? { ...m, read: true, deliveryStatus: 'sent' as DeliveryStatus }
            : m
    );
}

// ─── Unread ────────────────────────────────────────────────────────────────────

export function isUnreadMessageForCurrentUser(message: ChatMessage, currentUserId: number | null) {
    return currentUserId !== null && message.id > 0 && message.senderId !== currentUserId;
}

export function getUnreadDividerCandidateId(
    messages: ChatMessage[],
    unreadCount: number,
    currentUserId: number | null
) {
    if (unreadCount <= 0) return null;
    const incoming = messages.filter((m) => isUnreadMessageForCurrentUser(m, currentUserId));
    if (incoming.length === 0) return messages.find((m) => m.id > 0)?.id ?? null;
    const startIdx = Math.max(incoming.length - unreadCount, 0);
    return incoming[startIdx]?.id ?? incoming[0]?.id ?? null;
}

// ─── Delivery status & reactions ─────────────────────────────────────────────

export function markOptimisticMessageSending(messages: ChatMessage[], clientId: string) {
    return messages.map((m) =>
        m.clientId === clientId ? { ...m, deliveryStatus: 'sending' as const } : m
    );
}

export function markOptimisticMessageFailed(messages: ChatMessage[], clientId: string) {
    return messages.map((m) =>
        m.clientId === clientId && m.deliveryStatus === 'sending'
            ? { ...m, deliveryStatus: 'failed' as const }
            : m
    );
}

export function getDeliveryStatusLabel(
    message: ChatMessage,
    selectedUser: User | null,
    isLatestSeen: boolean,
    isLatestOutgoing: boolean
) {
    if (message.deliveryStatus === 'sending') return 'Sending';
    if (message.deliveryStatus === 'failed') return 'Failed';
    if (message.read) return isLatestSeen ? 'Seen' : '';
    if (isLatestOutgoing) {
        if (!message.chatRoomId && selectedUser?.online) return 'Delivered';
        return 'Sent';
    }
    return '';
}

export function getGroupedMessageReactions(message: ChatMessage, currentUserId: number | null) {
    const reactions = message.reactions ?? [];
    const grouped = new Map<string, { emoji: string; count: number; reactedByCurrentUser: boolean; title: string }>();
    reactions.forEach((reaction) => {
        const g = grouped.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, reactedByCurrentUser: false, title: '' };
        const name = reaction.fullName?.trim() || reaction.username;
        g.count += 1;
        g.reactedByCurrentUser ||= reaction.userId === currentUserId;
        g.title = g.title ? `${g.title}, ${name}` : name;
        grouped.set(reaction.emoji, g);
    });
    return Array.from(grouped.values());
}

export function hasCurrentUserReaction(message: ChatMessage, currentUserId: number | null, emoji?: string) {
    if (currentUserId === null) return false;
    return (message.reactions ?? []).some(
        (r) => r.userId === currentUserId && (!emoji || r.emoji === emoji)
    );
}

export function canUseMessageActions(message: ChatMessage) {
    return message.id > 0 && message.deliveryStatus !== 'failed' && !message.recalled && !isCallMessage(message);
}

// ─── Message preview / search content ────────────────────────────────────────

export function getMessagePreviewContent(message: Message) {
    if (message.recalled) return 'Message recalled';
    const content = message.content?.trim();
    if (content) return content;
    if (getMessageType(message) === 'IMAGE') return 'Photo';
    if (getMessageType(message) === 'VIDEO') return 'Video';
    if (getMessageType(message) === 'AUDIO') return '🎙 Voice message';
    if (getMessageType(message) === 'FILE') return '📁 File attachment';
    if (isCallMessage(message)) return 'Call';
    return '';
}

export function getMessageSearchPreview(message: Message) {
    const content = getMessagePreviewContent(message);
    if (content) return content;
    const title = message.linkPreview?.title?.trim();
    if (title) return title;
    return 'Message';
}

export function getSearchableMessageValues(message: Message) {
    return [
        message.content,
        message.linkPreview?.title,
        message.linkPreview?.description,
        message.linkPreview?.domain,
    ].filter((v): v is string => Boolean(v?.trim()));
}

export function getMessageSearchSnippet(message: Message, query: string) {
    const nq = query.trim().toLowerCase();
    const source =
        getSearchableMessageValues(message).find((v) => v.toLowerCase().includes(nq)) ??
        getMessageSearchPreview(message);
    const ns = source.replace(/\s+/g, ' ').trim() || 'Message';
    if (!nq) return ns;
    const matchIndex = ns.toLowerCase().indexOf(nq);
    if (matchIndex < 0) return ns;
    const before = 36, after = 84;
    const start = Math.max(0, matchIndex - before);
    const end = Math.min(ns.length, matchIndex + nq.length + after);
    return `${start > 0 ? '...' : ''}${ns.slice(start, end)}${end < ns.length ? '...' : ''}`;
}

export function messageMatchesSearchQuery(message: Message, query: string) {
    const nq = query.trim().toLowerCase();
    if (!nq || message.recalled) return false;
    return getSearchableMessageValues(message).some((v) => v.toLowerCase().includes(nq));
}

// ─── Media helpers ────────────────────────────────────────────────────────────

export function applyMediaPayload(message: ChatMessage, media?: MediaAttachment): ChatMessage {
    if (!media) return message;
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

export function getMediaPayloadFromMessage(message: Message): MediaAttachment | undefined {
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

export function createReplyFromMessage(message: ChatMessage | null): MessageReply | null {
    if (!message || message.id <= 0) return null;
    return {
        id: message.id,
        content: getMessagePreviewContent(message) || 'Message',
        type: getMessageType(message),
        senderId: message.senderId,
        senderName: message.senderFullName?.trim() || message.senderUsername || 'Unknown',
        recalled: Boolean(message.recalled),
    };
}

export function getPendingMediaType(file: File): Pick<PendingMedia, 'type' | 'resourceType'> {
    if (file.type.startsWith('image/')) return { type: 'IMAGE', resourceType: 'image' };
    if (file.type.startsWith('video/')) return { type: 'VIDEO', resourceType: 'video' };
    if (file.type.startsWith('audio/')) return { type: 'AUDIO', resourceType: 'video' };
    return { type: 'FILE', resourceType: 'raw' };
}

export function cloudinaryResultToMedia(result: CloudinaryUploadResult): MediaAttachment {
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

// ─── Optimistic messages ──────────────────────────────────────────────────────

export function createOptimisticMessage(
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
        id: tempId, content, type, replyTo, senderId, receiverId,
        timestamp: new Date().toISOString(), read: false, clientId,
        deliveryStatus: 'sending',
    }, media);
}

export function createOptimisticRoomMessage(
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
        id: tempId, content, type, replyTo,
        senderId: sender.id,
        senderUsername: sender.username,
        senderFullName: getUserDisplayName(sender),
        receiverId: null,
        chatRoomId,
        timestamp: new Date().toISOString(),
        read: false, clientId,
        deliveryStatus: 'sending',
    }, media);
}

// ─── Sender info ──────────────────────────────────────────────────────────────

export function getMessageSenderName(
    message: ChatMessage,
    selectedRoom: ChatRoom | null,
    findKnownUserById?: (id: number) => User | null
) {
    const participant = selectedRoom?.participants.find((u) => u.id === message.senderId);
    if (participant) {
        const name = getUserDisplayName(participant);
        if (name) return name;
    }
    const known = findKnownUserById ? findKnownUserById(message.senderId) : null;
    if (known) {
        const name = getUserDisplayName(known);
        if (name) return name;
    }
    if (message.senderFullName?.trim()) return message.senderFullName;
    return message.senderUsername ?? 'Unknown';
}

export function getMessageSenderUser(
    message: ChatMessage,
    selectedUser: User | null,
    selectedRoom: ChatRoom | null,
    findKnownUserById: (id: number) => User | null
): User {
    if (selectedUser && selectedUser.id === message.senderId) return selectedUser;
    const known = findKnownUserById(message.senderId);
    if (known) return known;
    const participant = selectedRoom?.participants.find((u) => u.id === message.senderId);
    if (participant) return participant;
    return {
        id: message.senderId,
        username: message.senderUsername || 'user',
        fullName: message.senderFullName,
        email: '',
        createdAt: '',
        online: false,
    };
}

// ─── Private conversation ─────────────────────────────────────────────────────

export function getPrivateConversationUserId(message: Message, currentUserId: number | null) {
    if (currentUserId === null || message.chatRoomId) return null;
    if (message.senderId === currentUserId) return message.receiverId ?? null;
    return message.receiverId === currentUserId || message.receiverId == null ? message.senderId : null;
}

export function getLatestSeenOutgoingMessageId(
    messages: ChatMessage[],
    currentUserId: number | null,
    selectedUserId: number | null
) {
    if (currentUserId === null || selectedUserId === null) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (
            m.id > 0 && !m.recalled && Boolean(m.read) &&
            m.senderId === currentUserId &&
            getPrivateConversationUserId(m, currentUserId) === selectedUserId
        ) { return m.id; }
    }
    return null;
}

export function getLatestOutgoingMessageId(messages: ChatMessage[], currentUserId: number | null) {
    if (currentUserId === null) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m && !m.recalled && m.senderId === currentUserId) {
            return m.id > 0 ? m.id : (m.clientId || null);
        }
    }
    return null;
}

// ─── Shared content ───────────────────────────────────────────────────────────

export function isSharedMediaMessage(message: Message) {
    return !message.recalled && isMediaMessage(message) && Boolean(message.mediaUrl?.trim());
}

export function mergeSharedContentPage(
    current: ChatMessage[],
    pageMessages: Message[],
    reset: boolean
) {
    const delivered = pageMessages.map(toDeliveredMessage);
    if (reset) return delivered;
    const existingIds = new Set(current.map((m) => m.id));
    return [...current, ...delivered.filter((m) => !existingIds.has(m.id))];
}

export function prependSharedContentItem(
    current: ChatMessage[],
    incoming: Message,
    shouldInclude: SharedContentPredicate
) {
    if (!shouldInclude(incoming)) return current;
    const delivered = toDeliveredMessage(incoming);
    return [delivered, ...current.filter((m) => m.id !== delivered.id)];
}

export function updateKnownSharedContentItem(
    current: ChatMessage[],
    incoming: Message,
    shouldInclude: SharedContentPredicate
) {
    const idx = current.findIndex((m) => m.id === incoming.id);
    if (idx < 0) return current;
    if (!shouldInclude(incoming)) return current.filter((m) => m.id !== incoming.id);
    const delivered = toDeliveredMessage(incoming);
    return current.map((m, i) => (i === idx ? { ...m, ...delivered } : m));
}

// ─── Message grouping / list building ────────────────────────────────────────

export function shouldGroupAdjacentMessages(
    first: ChatMessage | undefined,
    second: ChatMessage | undefined
) {
    if (!first || !second || first.senderId !== second.senderId) return false;
    if (isCallMessage(first) || isCallMessage(second)) return false;
    if (getLocalDateKey(first.timestamp) !== getLocalDateKey(second.timestamp)) return false;
    const ft = getTimestampValue(first.timestamp);
    const st = getTimestampValue(second.timestamp);
    if (!ft || !st) return false;
    return st - ft <= MESSAGE_GROUP_THRESHOLD_MS;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function appendSeenByUser(users: User[], nextUser: User) {
    if (users.some((u) => u.id === nextUser.id)) return users;
    return [...users, nextUser];
}

export function createClientId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getCallEventLabel(message: Message) {
    const content = message.content?.trim();
    if (content) return content;
    const typeLabel = message.callType === 'VIDEO' ? 'Video' : 'Audio';
    if (message.callStatus === 'ENDED') {
        const dur = formatCallDurationLabel(message.callDurationSeconds);
        return dur ? `${typeLabel} call ended · ${dur}` : `${typeLabel} call ended`;
    }
    if (message.callStatus === 'MISSED') return `Missed ${typeLabel.toLowerCase()} call`;
    if (message.callStatus === 'REJECTED') return `${typeLabel} call declined`;
    if (message.callStatus === 'CANCELED') return `${typeLabel} call canceled`;
    if (message.callStatus === 'BUSY') return `${typeLabel} call not answered · Busy`;
    return `${typeLabel} call`;
}

function formatCallDurationLabel(totalSeconds?: number | null) {
    if (!totalSeconds || totalSeconds <= 0) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
}
