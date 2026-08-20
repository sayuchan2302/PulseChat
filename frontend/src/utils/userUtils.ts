/**
 * User display / avatar / friendship utilities.
 */
import type { User, ChatRoom, Friendship, ConversationSetting, PresenceEvent } from '../types';
import { API_BASE_URL } from '../config/constants';

// ─── Display names ────────────────────────────────────────────────────────────

export function getUserDisplayName(user: User | null) {
    return user?.nickname?.trim() || user?.fullName?.trim() || user?.username || '';
}

export function getUserAccountDisplayName(user: User | null) {
    return user?.fullName?.trim() || user?.username || '';
}

export function getUserInitial(user: User | null) {
    return getUserDisplayName(user).charAt(0).toUpperCase() || '?';
}

// ─── URLs ─────────────────────────────────────────────────────────────────────

export function getApiAssetUrl(assetUrl?: string | null) {
    const trimmed = assetUrl?.trim();
    if (!trimmed) return '';
    if (/^(https?:|blob:|data:)/i.test(trimmed)) return trimmed;
    const base = new URL(
        API_BASE_URL,
        typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    );
    const apiPath = base.pathname.replace(/\/$/, '');
    const assetPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const resolved = apiPath && !assetPath.startsWith(`${apiPath}/`) ? `${apiPath}${assetPath}` : assetPath;
    return `${base.origin}${resolved}`;
}

export function getAvatarUrl(avatar?: string | null) {
    return getApiAssetUrl(avatar);
}

export function getUserAvatarUrl(user: User | null) {
    return getAvatarUrl(user?.avatar);
}

export function getMediaUrl(mediaUrl?: string | null) {
    return getApiAssetUrl(mediaUrl);
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export function applyPresenceToUser(user: User, presence: PresenceEvent) {
    if (user.id !== presence.userId) return user;
    const nextLastSeenAt = presence.lastSeenAt ?? user.lastSeenAt;
    if (user.online === presence.online && user.lastSeenAt === nextLastSeenAt) return user;
    return { ...user, online: presence.online, lastSeenAt: nextLastSeenAt };
}

// ─── Profile updates ──────────────────────────────────────────────────────────

export function applyProfileToUser(user: User, updated: User) {
    if (user.id !== updated.id) return user;
    return {
        ...user, ...updated,
        unreadCount: user.unreadCount ?? updated.unreadCount,
        friendshipStatus: user.friendshipStatus ?? updated.friendshipStatus,
        friendshipId: user.friendshipId ?? updated.friendshipId,
        lastMessageContent: user.lastMessageContent ?? updated.lastMessageContent,
        lastMessageAt: user.lastMessageAt ?? updated.lastMessageAt,
        lastMessageSenderId: user.lastMessageSenderId ?? updated.lastMessageSenderId,
        pinned: user.pinned ?? updated.pinned,
        muted: user.muted ?? updated.muted,
        archived: user.archived ?? updated.archived,
    };
}

export function applyProfileToRoom(room: ChatRoom, updated: User) {
    return {
        ...room,
        participants: room.participants.map((p) => applyProfileToUser(p, updated)),
    };
}

export function applyConversationSettingToUser(user: User, setting: ConversationSetting) {
    if (setting.targetUserId !== user.id) return user;
    return { ...user, pinned: setting.pinned, muted: setting.muted, archived: setting.archived };
}

export function applyConversationSettingToRoom(room: ChatRoom, setting: ConversationSetting) {
    if (setting.chatRoomId !== room.id) return room;
    return { ...room, pinned: setting.pinned, muted: setting.muted, archived: setting.archived };
}

// ─── Friendship ───────────────────────────────────────────────────────────────

export function getProfileUserFromFriendship(friendship: Friendship, currentUserId: number | null) {
    return friendship.requester.id === currentUserId ? friendship.receiver : friendship.requester;
}

export function getUserFriendshipStatusFromFriendship(
    friendship: Friendship,
    currentUserId: number | null
): User['friendshipStatus'] {
    if (friendship.status === 'accepted') return 'accepted';
    if (friendship.status === 'declined') return 'declined';
    return friendship.receiver.id === currentUserId ? 'pending_incoming' : 'pending_outgoing';
}

export function applyFriendshipToProfileUser(user: User, friendship: Friendship, currentUserId: number | null) {
    const profileUser = getProfileUserFromFriendship(friendship, currentUserId);
    if (user.id !== profileUser.id) return user;
    return {
        ...applyProfileToUser(user, profileUser),
        friendshipId: friendship.id,
        friendshipStatus: getUserFriendshipStatusFromFriendship(friendship, currentUserId),
    };
}

export function mergeViewedProfileUser(viewed: User, refreshed?: User) {
    if (!refreshed) return viewed;
    return {
        ...viewed, ...refreshed,
        friendshipId: viewed.friendshipId ?? refreshed.friendshipId,
        friendshipStatus: viewed.friendshipStatus ?? refreshed.friendshipStatus,
    };
}

// ─── Status / labels ──────────────────────────────────────────────────────────

export function canChatWithUser(user: User) {
    return user.friendshipStatus === 'accepted';
}

export function getUserStatusClass(user: User) {
    return canChatWithUser(user) ? (user.online ? 'online' : 'offline') : 'relationship';
}

export function getFriendshipStatusLabel(user: User) {
    switch (user.friendshipStatus) {
        case 'pending_incoming': return 'Request received';
        case 'pending_outgoing': return 'Pending';
        case 'declined':
        case 'none': return 'Not friends';
        case 'accepted':
        default: return user.online ? 'Online' : 'Offline';
    }
}

export function getRelationshipLabel(user: User) {
    switch (user.friendshipStatus) {
        case 'accepted': return 'Friend';
        case 'pending_incoming': return 'Request received';
        case 'pending_outgoing': return 'Pending';
        default: return 'Not friends';
    }
}

export function getPresenceLabel(user: User | null) {
    if (!user) return 'Offline';
    if (user.online) return 'Online';
    // formatRelativeTime is imported at call site to avoid circular dep
    return '';
}

// ─── Typing ───────────────────────────────────────────────────────────────────

export function isTypingFromSelectedUser(typing: { senderId: number }, selectedUserId: number | null) {
    return selectedUserId !== null && typing.senderId === selectedUserId;
}

export function getTypingIndicatorLabel(typingUsers: User[]) {
    if (typingUsers.length === 0) return '';
    if (typingUsers.length === 1) return `${getUserDisplayName(typingUsers[0])} is typing...`;
    if (typingUsers.length === 2) return `${getUserDisplayName(typingUsers[0])} and ${getUserDisplayName(typingUsers[1])} are typing...`;
    return `${typingUsers.length} people are typing...`;
}

// ─── Unread counts ─────────────────────────────────────────────────────────────

export function mergeUnreadCounts(users: User[], unreadCounts: Array<{ userId: number; unreadCount: number }>) {
    const map = new Map(unreadCounts.map((u) => [u.userId, u.unreadCount]));
    return users.map((user) => ({ ...user, unreadCount: map.get(user.id) ?? 0 }));
}

export function incrementUnreadCount(users: User[], senderId: number) {
    return users.map((u) => u.id === senderId ? { ...u, unreadCount: (u.unreadCount ?? 0) + 1 } : u);
}

export function resetUnreadCount(users: User[], userId: number) {
    return users.map((u) => (u.id === userId ? { ...u, unreadCount: 0 } : u));
}

export function resetRoomUnreadCount(rooms: ChatRoom[], roomId: number) {
    return rooms.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r));
}

// ─── Avatar / room avatar rendering helpers ───────────────────────────────────

export function shouldShowUsername(user: User) {
    return getUserDisplayName(user) !== user.username;
}

export function getRoomInitial(room: ChatRoom) {
    return room.name.trim().charAt(0).toUpperCase();
}

export function getRoomMemberSummary(room: ChatRoom, currentUserId?: number | null) {
    const others = room.participants.filter((p) => p.id !== currentUserId);
    const names = others.slice(0, 2).map(getUserDisplayName);
    const remaining = others.length - names.length;
    if (names.length === 0) return 'Only you';
    return remaining > 0 ? `${names.join(', ')} +${remaining}` : names.join(', ');
}

export function sortParticipantsForDetails(participants: User[], ownerId?: number | null) {
    return [...participants].sort((l, r) => {
        const lOwner = l.id === ownerId || l.role === 'OWNER';
        const rOwner = r.id === ownerId || r.role === 'OWNER';
        if (lOwner !== rOwner) return lOwner ? -1 : 1;
        const lMod = l.role === 'MODERATOR';
        const rMod = r.role === 'MODERATOR';
        if (lMod !== rMod) return lMod ? -1 : 1;
        if (l.online !== r.online) return l.online ? -1 : 1;
        return getUserDisplayName(l).localeCompare(getUserDisplayName(r));
    });
}

export function shouldOpenConversationDetailsByDefault() {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(max-width: 768px)').matches;
}

export function matchesFriendSearch(user: User, query: string) {
    const nq = query.trim().toLowerCase();
    if (!nq) return true;
    return (
        getUserDisplayName(user).toLowerCase().includes(nq) ||
        user.username.toLowerCase().includes(nq)
    );
}
