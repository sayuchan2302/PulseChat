/**
 * Conversation sidebar sorting / filtering utilities.
 */
import type { SidebarConversationItem, ConversationFilter } from '../types/chat.types';
import type { User, ChatRoom, Message } from '../types';
import { getTimestampValue } from './formatUtils';
import { getUserDisplayName, getFriendshipStatusLabel, shouldShowUsername, getRoomMemberSummary } from './userUtils';
import { getPrivateConversationUserId, getMessagePreviewContent } from './messageUtils';

// ─── Activity timestamps ──────────────────────────────────────────────────────

export function getRoomActivityTimestamp(room: ChatRoom) {
    return getTimestampValue(room.lastMessageAt) || getTimestampValue(room.createdAt);
}

export function getUserActivityTimestamp(user: User) {
    return getTimestampValue(user.lastMessageAt);
}

export function getSidebarConversationActivityTimestamp(item: SidebarConversationItem) {
    return item.type === 'user'
        ? getUserActivityTimestamp(item.user)
        : getRoomActivityTimestamp(item.room);
}

// ─── Pinned / archived / unread ───────────────────────────────────────────────

export function isPinnedConversation(item: SidebarConversationItem) {
    return item.type === 'user' ? Boolean(item.user.pinned) : Boolean(item.room.pinned);
}

export function isArchivedUserConversation(user: User) {
    return Boolean(user.archived);
}

export function isArchivedRoomConversation(room: ChatRoom) {
    return Boolean(room.archived);
}

export function hasUnreadUserConversation(user: User) {
    return (user.unreadCount ?? 0) > 0;
}

export function hasUnreadRoomConversation(room: ChatRoom) {
    return (room.unreadCount ?? 0) > 0;
}

export function hasPrivateConversation(user: User) {
    return Boolean(user.lastMessageAt || user.lastMessageContent?.trim() || (user.unreadCount ?? 0) > 0);
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

export function compareRoomsByChatActivity(a: ChatRoom, b: ChatRoom) {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const diff = getRoomActivityTimestamp(b) - getRoomActivityTimestamp(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
}

export function sortRoomsByChatActivity(rooms: ChatRoom[]) {
    return [...rooms].sort(compareRoomsByChatActivity);
}

export function compareUsersByChatActivity(a: User, b: User) {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const diff = getTimestampValue(b.lastMessageAt) - getTimestampValue(a.lastMessageAt);
    if (diff !== 0) return diff;
    return getUserDisplayName(a).localeCompare(getUserDisplayName(b));
}

export function getSidebarConversationLabel(item: SidebarConversationItem) {
    return item.type === 'user' ? getUserDisplayName(item.user) : item.room.name;
}

export function compareSidebarConversationItems(a: SidebarConversationItem, b: SidebarConversationItem) {
    if (isPinnedConversation(a) !== isPinnedConversation(b)) return isPinnedConversation(a) ? -1 : 1;
    const diff = getSidebarConversationActivityTimestamp(b) - getSidebarConversationActivityTimestamp(a);
    if (diff !== 0) return diff;
    return getSidebarConversationLabel(a).localeCompare(getSidebarConversationLabel(b));
}

// ─── Filtering ────────────────────────────────────────────────────────────────

export function shouldIncludeUserConversation(user: User, filter: ConversationFilter) {
    if (filter === 'archived') return isArchivedUserConversation(user);
    if (isArchivedUserConversation(user)) return false;
    return filter === 'unread' ? hasUnreadUserConversation(user) : true;
}

export function shouldIncludeRoomConversation(room: ChatRoom, filter: ConversationFilter) {
    if (filter === 'archived') return isArchivedRoomConversation(room);
    if (isArchivedRoomConversation(room)) return false;
    return filter === 'unread' ? hasUnreadRoomConversation(room) : true;
}

export function buildSidebarConversationItems(users: User[], rooms: ChatRoom[], filter: ConversationFilter) {
    return [
        ...users.filter((u) => shouldIncludeUserConversation(u, filter)).map((u) => ({ type: 'user' as const, user: u })),
        ...rooms.filter((r) => shouldIncludeRoomConversation(r, filter)).map((r) => ({ type: 'room' as const, room: r })),
    ].sort(compareSidebarConversationItems);
}

// ─── isRoomParticipant ────────────────────────────────────────────────────────

export function isRoomParticipant(room: ChatRoom, userId: number | null) {
    return userId !== null && room.participants.some((p) => p.id === userId);
}

export function appendOrUpdateRoom(rooms: ChatRoom[], incoming: ChatRoom) {
    const exists = rooms.some((r) => r.id === incoming.id);
    const next = exists
        ? rooms.map((r) => (r.id === incoming.id ? incoming : r))
        : [incoming, ...rooms];
    return sortRoomsByChatActivity(next);
}

// ─── Preview helpers ──────────────────────────────────────────────────────────

function shouldUseMessageAsRoomPreview(room: ChatRoom, message: Message) {
    return getTimestampValue(message.timestamp) >= getTimestampValue(room.lastMessageAt);
}

function getMessageSenderDisplayName(message: Message) {
    return message.senderFullName?.trim() || message.senderUsername || 'Unknown';
}

export function applyRoomPreviewToRoom(room: ChatRoom, message: Message) {
    if (message.chatRoomId !== room.id || !shouldUseMessageAsRoomPreview(room, message)) return room;
    return {
        ...room,
        lastMessageContent: getMessagePreviewContent(message),
        lastMessageAt: message.timestamp,
        lastMessageSenderId: message.senderId,
        lastMessageSenderName: getMessageSenderDisplayName(message),
    };
}

export function applyRoomPreviewToRooms(
    rooms: ChatRoom[],
    message: Message,
    currentUserId: number | null,
    selectedRoomId: number | null
) {
    if (!message.chatRoomId) return rooms;
    let didUpdate = false;
    const next = rooms.map((room) => {
        if (room.id !== message.chatRoomId) return room;
        const withPreview = applyRoomPreviewToRoom(room, message);
        const shouldIncrement = message.senderId !== currentUserId && room.id !== selectedRoomId;
        const nextRoom = {
            ...withPreview,
            unreadCount: shouldIncrement
                ? (withPreview.unreadCount ?? 0) + 1
                : withPreview.unreadCount ?? 0,
        };
        didUpdate ||= nextRoom !== room;
        return nextRoom;
    });
    return didUpdate ? sortRoomsByChatActivity(next) : rooms;
}

export function applyConversationPreviewToUser(user: User, message: Message, currentUserId: number | null) {
    const uid = getPrivateConversationUserId(message, currentUserId);
    const shouldUse = getTimestampValue(message.timestamp) >= getTimestampValue(user.lastMessageAt);
    if (uid !== user.id || !shouldUse) return user;
    return {
        ...user,
        lastMessageContent: getMessagePreviewContent(message),
        lastMessageAt: message.timestamp,
        lastMessageSenderId: message.senderId,
    };
}

export function applyConversationPreviewToUsers(
    users: User[],
    message: Message,
    currentUserId: number | null,
    moveUpdatedUserToTop: boolean
) {
    const uid = getPrivateConversationUserId(message, currentUserId);
    if (uid === null) return users;
    let didUpdate = false;
    const next = users.map((u) => {
        const nu = applyConversationPreviewToUser(u, message, currentUserId);
        didUpdate ||= nu !== u;
        return nu;
    });
    if (!didUpdate) return users;
    return moveUpdatedUserToTop ? [...next].sort(compareUsersByChatActivity) : next;
}

// ─── Preview text ─────────────────────────────────────────────────────────────

export function getConversationPreviewText(user: User, currentUserId: number | null) {
    const content = user.lastMessageContent?.trim();
    if (content) return user.lastMessageSenderId === currentUserId ? `You: ${content}` : content;
    const username = shouldShowUsername(user) ? ` @${user.username}` : '';
    return `${getFriendshipStatusLabel(user)}${username}`;
}

export function getRoomPreviewText(room: ChatRoom, currentUserId: number | null) {
    const content = room.lastMessageContent?.trim();
    if (!content) return getRoomMemberSummary(room, currentUserId);
    if (room.lastMessageSenderId === currentUserId) return `You: ${content}`;
    const senderName = room.lastMessageSenderName?.trim();
    return senderName ? `${senderName}: ${content}` : content;
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export function isMutedIncomingConversation(
    message: Message,
    currentUserId: number | null,
    users: User[],
    friends: User[],
    rooms: ChatRoom[]
) {
    if (message.chatRoomId) return Boolean(rooms.find((r) => r.id === message.chatRoomId)?.muted);
    const uid = getPrivateConversationUserId(message, currentUserId);
    if (uid === null) return false;
    return Boolean(
        users.find((u) => u.id === uid)?.muted ??
        friends.find((f) => f.id === uid)?.muted
    );
}
