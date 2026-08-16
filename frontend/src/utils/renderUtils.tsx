import React from 'react';
import type { User, ChatRoom, LinkPreview } from '../types';
import { getAvatarUrl, getUserInitial, getRoomInitial } from './userUtils';
import { escapeRegExp, trimUrlToken } from './formatUtils';
import { TEXT_URL_REGEX } from '../constants/chatConstants';

const MENTION_TOKEN_REGEX = /@([a-zA-Z0-9_.-]+)/g;

export function renderHighlightedSearchText(text: string, query: string): React.ReactNode {
    const normalizedQuery = query.trim();
    if (!text || !normalizedQuery) {
        return text;
    }

    const matcher = new RegExp(escapeRegExp(normalizedQuery), 'gi');
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const match of text.matchAll(matcher)) {
        const matchText = match[0];
        const matchIndex = match.index ?? 0;

        if (matchIndex > lastIndex) {
            nodes.push(text.slice(lastIndex, matchIndex));
        }

        nodes.push(
            <mark key={`message-search-highlight-${matchIndex}-${nodes.length}`}>
                {matchText}
            </mark>
        );

        lastIndex = matchIndex + matchText.length;
    }

    if (lastIndex < text.length) {
        nodes.push(text.slice(lastIndex));
    }

    return nodes.length > 0 ? nodes : text;
}

export function renderTextWithMentions(text: string): React.ReactNode {
    if (!text) {
        return null;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    MENTION_TOKEN_REGEX.lastIndex = 0;

    for (const match of text.matchAll(MENTION_TOKEN_REGEX)) {
        const rawMention = match[0];
        const mentionName = match[1] || '';
        const matchIndex = match.index ?? 0;
        if (matchIndex > lastIndex) {
            parts.push(text.slice(lastIndex, matchIndex));
        }
        const isAll = mentionName.toLowerCase() === 'all';
        parts.push(
            <span
                key={`mention-${matchIndex}-${rawMention}`}
                className={`mention-tag ${isAll ? 'mention-tag-all' : ''}`}
            >
                {rawMention}
            </span>
        );
        lastIndex = matchIndex + rawMention.length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
}

export function renderLinkedText(text: string): React.ReactNode {
    if (!text) {
        return null;
    }

    const nodes: React.ReactNode[] = [];
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
            nodes.push(renderTextWithMentions(text.slice(lastIndex, matchIndex)));
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
            nodes.push(renderTextWithMentions(trailingText));
        }

        lastIndex = matchIndex + rawUrl.length;
    }

    if (lastIndex < text.length) {
        nodes.push(renderTextWithMentions(text.slice(lastIndex)));
    }

    return nodes.length > 0 ? nodes : text;
}

export function renderLinkPreviewCard(preview?: LinkPreview | null, onImageLoad?: () => void): React.ReactNode {
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

export function renderUserAvatar(user: User | null, className = 'user-avatar'): React.ReactNode {
    const avatarUrl = getAvatarUrl(user?.avatar);

    return (
        <div className={className}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : getUserInitial(user)}
        </div>
    );
}

export function renderRoomAvatar(room?: ChatRoom | null, className = 'user-avatar room-avatar'): React.ReactNode {
    if (!room) return null;
    if (room.avatar) {
        return (
            <div className={className}>
                <img src={room.avatar} alt={room.name} className="room-avatar-image" />
            </div>
        );
    }
    return <div className={className}>{getRoomInitial(room)}</div>;
}
