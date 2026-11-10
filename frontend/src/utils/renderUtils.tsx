import React from 'react';
import type { User, ChatRoom, LinkPreview } from '../types';
import { getAvatarUrl, getUserInitial, getRoomInitial } from './userUtils';
import { escapeRegExp, trimUrlToken } from './formatUtils';
import { TEXT_URL_REGEX } from '../constants/chatConstants';

const MENTION_TOKEN_REGEX = /@([a-zA-Z0-9_.-]+)/g;
const CODE_BLOCK_REGEX = /```([a-zA-Z0-9_-]*)\r?\n?([\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const INLINE_MARKDOWN_REGEX = /\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\*([^*\n]+)\*/g;

function isSafeHttpUrl(url?: string | null): url is string {
    if (!url) {
        return false;
    }

    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

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

function renderFormattedTextWithMentions(text: string, keyPrefix: string): React.ReactNode {
    if (!text) {
        return null;
    }

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    INLINE_MARKDOWN_REGEX.lastIndex = 0;

    for (const match of text.matchAll(INLINE_MARKDOWN_REGEX)) {
        const rawMatch = match[0];
        const matchIndex = match.index ?? 0;

        if (matchIndex > lastIndex) {
            parts.push(renderTextWithMentions(text.slice(lastIndex, matchIndex)));
        }

        const boldText = match[1];
        const strikeText = match[2];
        const italicText = match[3];
        const key = `${keyPrefix}-md-${matchIndex}`;

        if (boldText !== undefined) {
            parts.push(<strong key={key}>{renderTextWithMentions(boldText)}</strong>);
        } else if (strikeText !== undefined) {
            parts.push(<del key={key}>{renderTextWithMentions(strikeText)}</del>);
        } else if (italicText !== undefined) {
            parts.push(<em key={key}>{renderTextWithMentions(italicText)}</em>);
        }

        lastIndex = matchIndex + rawMatch.length;
    }

    if (lastIndex < text.length) {
        parts.push(renderTextWithMentions(text.slice(lastIndex)));
    }

    return parts.length > 0 ? parts : renderTextWithMentions(text);
}

function renderUrlsAndFormattedText(text: string, keyPrefix: string): React.ReactNode {
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
            nodes.push(renderFormattedTextWithMentions(text.slice(lastIndex, matchIndex), `${keyPrefix}-u-${matchIndex}`));
        }

        nodes.push(
            <a
                key={`${keyPrefix}-link-${matchIndex}-${url}`}
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
            nodes.push(renderFormattedTextWithMentions(trailingText, `${keyPrefix}-ut-${matchIndex}`));
        }

        lastIndex = matchIndex + rawUrl.length;
    }

    if (lastIndex < text.length) {
        nodes.push(renderFormattedTextWithMentions(text.slice(lastIndex), `${keyPrefix}-u-end`));
    }

    return nodes.length > 0 ? nodes : text;
}

function renderInlineCodeAndText(text: string, keyPrefix: string): React.ReactNode {
    if (!text) {
        return null;
    }

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    INLINE_CODE_REGEX.lastIndex = 0;

    for (const match of text.matchAll(INLINE_CODE_REGEX)) {
        const rawMatch = match[0];
        const codeContent = match[1] ?? '';
        const matchIndex = match.index ?? 0;

        if (matchIndex > lastIndex) {
            nodes.push(renderUrlsAndFormattedText(text.slice(lastIndex, matchIndex), `${keyPrefix}-ic-${matchIndex}`));
        }

        nodes.push(
            <code key={`${keyPrefix}-code-${matchIndex}`} className="message-inline-code">
                {codeContent}
            </code>
        );

        lastIndex = matchIndex + rawMatch.length;
    }

    if (lastIndex < text.length) {
        nodes.push(renderUrlsAndFormattedText(text.slice(lastIndex), `${keyPrefix}-ic-end`));
    }

    return nodes.length > 0 ? nodes : text;
}

function renderCodeBlock(codeContent: string, language: string, key: string): React.ReactNode {
    const normalizedCode = codeContent.replace(/\r?\n$/, '');
    const langLabel = language.trim() || 'code';

    return (
        <div key={key} className="message-code-block-wrap">
            <div className="message-code-block-header">
                <span className="message-code-lang">{langLabel}</span>
                <button
                    type="button"
                    className="message-code-copy-btn"
                    onClick={(event) => {
                        const button = event.currentTarget;
                        void navigator.clipboard?.writeText(normalizedCode);
                        button.textContent = 'Copied ✓';
                        window.setTimeout(() => {
                            button.textContent = 'Copy';
                        }, 1500);
                    }}
                    aria-label="Copy code"
                >
                    Copy
                </button>
            </div>
            <pre className="message-code-block">
                <code>{normalizedCode}</code>
            </pre>
        </div>
    );
}

export function renderLinkedText(text: string): React.ReactNode {
    if (!text) {
        return null;
    }

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    CODE_BLOCK_REGEX.lastIndex = 0;

    for (const match of text.matchAll(CODE_BLOCK_REGEX)) {
        const rawMatch = match[0];
        const language = match[1] ?? '';
        const codeContent = match[2] ?? '';
        const matchIndex = match.index ?? 0;

        if (matchIndex > lastIndex) {
            nodes.push(renderInlineCodeAndText(text.slice(lastIndex, matchIndex), `cb-${matchIndex}`));
        }

        nodes.push(renderCodeBlock(codeContent, language, `codeblock-${matchIndex}`));
        lastIndex = matchIndex + rawMatch.length;
    }

    if (lastIndex < text.length) {
        nodes.push(renderInlineCodeAndText(text.slice(lastIndex), 'cb-end'));
    }

    return nodes.length > 0 ? nodes : text;
}

export function renderLinkPreviewCard(preview?: LinkPreview | null, onImageLoad?: () => void): React.ReactNode {
    const url = preview?.url?.trim();
    if (!isSafeHttpUrl(url)) {
        return null;
    }

    const rawImageUrl = preview?.imageUrl?.trim();
    const imageUrl = rawImageUrl && (rawImageUrl.startsWith('/') || isSafeHttpUrl(rawImageUrl))
        ? rawImageUrl
        : undefined;
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
