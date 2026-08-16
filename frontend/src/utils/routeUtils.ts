/**
 * Chat page routing utilities.
 */
import type { ChatRouteState } from '../types/chat.types';
import { ROUTES } from '../config/constants';

export function getChatRoute() {
    return ROUTES.CHAT;
}

export function getFriendsRoute() {
    return `${ROUTES.CHAT}/friends`;
}

export function getRequestsRoute() {
    return `${ROUTES.CHAT}/requests`;
}

export function getUserChatRoute(username: string) {
    return `${ROUTES.CHAT}/u/${encodeURIComponent(username)}`;
}

export function getRoomChatRoute(roomId: number) {
    return `${ROUTES.CHAT}/g/${roomId}`;
}

function safeDecodePathSegment(segment: string) {
    try { return decodeURIComponent(segment); } catch { return ''; }
}

export function parseChatRoute(pathname: string): ChatRouteState {
    const base = ROUTES.CHAT.replace(/\/$/, '');
    const normalized = pathname.replace(/\/+$/, '') || base;
    if (normalized === base) return { kind: 'chat' };
    if (!normalized.startsWith(`${base}/`)) return { kind: 'unknown' };
    const segments = normalized
        .slice(base.length + 1)
        .split('/')
        .filter(Boolean)
        .map(safeDecodePathSegment);
    if (segments.length === 1 && segments[0] === 'friends') return { kind: 'friends' };
    if (segments.length === 1 && segments[0] === 'requests') return { kind: 'requests' };
    if (segments.length === 2 && segments[0] === 'u' && segments[1]) return { kind: 'user', username: segments[1] };
    if (segments.length === 2 && segments[0] === 'g') {
        const roomId = Number(segments[1]);
        return Number.isInteger(roomId) && roomId > 0 ? { kind: 'room', roomId } : { kind: 'unknown' };
    }
    return { kind: 'unknown' };
}
