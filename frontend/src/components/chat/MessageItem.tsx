import React from 'react';
import type { User, ChatRoom } from '../../types';
import type { ChatMessage, MessageListItem } from '../../types/chat.types';
import { isCallMessage, getMessageSenderUser, getMessageSenderName, getDeliveryStatusLabel } from '../../utils/messageUtils';
import { formatMessageTime } from '../../utils/formatUtils';
import { getUserDisplayName } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';
import './MessageItem.css';

export interface MessageItemProps {
    item: MessageListItem;
    currentUser: User | null;
    selectedUser: User | null;
    selectedRoom: ChatRoom | null;
    unreadDividerRef: React.RefObject<HTMLDivElement | null>;
    latestSeenOutgoingMessageId: number | null;
    latestOutgoingMessageId: number | string | null;
    latestRoomSeenByByMessageId: Record<number, User[]>;
    seenByLoadingMessageIds: number[];
    detailsOpen: boolean;
    rightSidebarTab: 'details' | 'search';
    messageSearchQuery: string;
    messageSearchResultIds: Set<number>;
    highlightedMessageId: number | null;
    isTimeExpanded?: boolean;
    onToggleTime?: (id: number | string) => void;
    onQuickReact?: (msg: ChatMessage, emoji: string) => void;
    renderCallMessageBody: (msg: ChatMessage) => React.ReactNode;
    findKnownUserById: (id: number) => User | null;
    handleOpenUserProfile: (user: User) => void;
    renderMessageActions: (msg: ChatMessage, isSent: boolean) => React.ReactNode;
    renderMessageBody: (msg: ChatMessage) => React.ReactNode;
    renderMessageReactions: (msg: ChatMessage) => React.ReactNode;
    handleRetryMessage: (msg: ChatMessage) => void;
    renderGroupSeenBy: (msg: ChatMessage, users: User[]) => React.ReactNode;
}

function MessageItemComponent({
    item,
    currentUser,
    selectedUser,
    selectedRoom,
    unreadDividerRef,
    latestSeenOutgoingMessageId,
    latestOutgoingMessageId,
    latestRoomSeenByByMessageId,
    seenByLoadingMessageIds,
    detailsOpen,
    rightSidebarTab,
    messageSearchQuery,
    messageSearchResultIds,
    highlightedMessageId,
    isTimeExpanded = false,
    onToggleTime,
    onQuickReact,
    renderCallMessageBody,
    findKnownUserById,
    handleOpenUserProfile,
    renderMessageActions,
    renderMessageBody,
    renderMessageReactions,
    handleRetryMessage,
    renderGroupSeenBy,
}: MessageItemProps) {
    if (item.type === 'date') {
        return (
            <div key={item.key} className="message-date-divider">
                <span>{item.label}</span>
            </div>
        );
    }

    if (item.type === 'unread') {
        return (
            <div
                key={item.key}
                ref={unreadDividerRef}
                className="message-unread-divider"
            >
                <span>Unread messages</span>
            </div>
        );
    }

    const { message, groupedWithPrevious, groupedWithNext, showSender } = item;
    const isCallEventMessage = isCallMessage(message);
    const callSenderId = isCallEventMessage ? (message.callerId ?? message.senderId) : message.senderId;
    const isSentByCurrentUser = callSenderId === currentUser?.id;
    const hasVisibleMessageTime = !isCallEventMessage && (isTimeExpanded || message.deliveryStatus === 'failed');
    const messageKey = message.id > 0 ? message.id : (message.clientId ?? 0);

    const handleBubbleClick = (event: React.MouseEvent) => {
        if (isCallEventMessage || message.deliveryStatus === 'failed') return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, video, audio, .reaction-pill, .message-actions, .message-retry-btn, .message-video-preview-wrap, .message-reply-quote')) {
            return;
        }
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
            return;
        }
        onToggleTime?.(messageKey);
    };

    const handleBubbleDoubleClick = (event: React.MouseEvent) => {
        if (isCallEventMessage || message.recalled || message.id <= 0 || message.deliveryStatus === 'failed') return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea, video, audio, .reaction-pill, .message-actions, .message-retry-btn, .message-video-preview-wrap, .message-reply-quote')) {
            return;
        }
        onQuickReact?.(message, '❤️');
    };
    const isLatestSeenOutgoingMessage =
        Boolean(selectedUser) &&
        isSentByCurrentUser &&
        message.id > 0 &&
        message.id === latestSeenOutgoingMessageId;
    const isLatestOutgoingMessage =
        isSentByCurrentUser &&
        (message.id > 0
            ? message.id === latestOutgoingMessageId
            : message.clientId === latestOutgoingMessageId);
    const deliveryStatusLabel = isSentByCurrentUser
        ? getDeliveryStatusLabel(
            message,
            selectedUser,
            isLatestSeenOutgoingMessage,
            isLatestOutgoingMessage
        )
        : '';
    const groupSeenByUsers =
        selectedRoom && isSentByCurrentUser && message.id > 0 && !message.recalled
            ? latestRoomSeenByByMessageId[message.id] ?? []
            : [];
    const groupSeenByLoading =
        selectedRoom &&
        isSentByCurrentUser &&
        message.id > 0 &&
        !message.recalled &&
        groupSeenByUsers.length === 0 &&
        seenByLoadingMessageIds.includes(message.id);
    const isMessageSearchMatch = Boolean(
        detailsOpen &&
        rightSidebarTab === 'search' &&
        messageSearchQuery.trim() &&
        messageSearchResultIds.has(message.id)
    );

    const isMentioned = Boolean(
        !isSentByCurrentUser && (
            (currentUser && message.mentionedUserIds?.includes(currentUser.id)) ||
            (currentUser && message.mentionedUsernames?.includes(currentUser.username)) ||
            (selectedRoom && message.content && /@all\b/i.test(message.content))
        )
    );
    const senderUser = !isSentByCurrentUser
        ? (selectedUser && (selectedUser.id === callSenderId || isCallEventMessage)
            ? selectedUser
            : getMessageSenderUser(message, selectedUser, selectedRoom, findKnownUserById))
        : null;

    return (
        <div
            key={item.key}
            data-message-id={message.id > 0 ? message.id : undefined}
            className={`message ${isSentByCurrentUser ? 'sent' : 'received'} ${isCallEventMessage ? 'call-message-item' : ''} ${message.deliveryStatus ?? ''
                } ${groupedWithPrevious ? 'grouped-with-previous' : ''} ${groupedWithNext ? 'grouped-with-next' : ''
                } ${hasVisibleMessageTime ? 'has-visible-time' : ''} ${isMessageSearchMatch ? 'message-search-match' : ''
                } ${highlightedMessageId === message.id ? 'highlighted' : ''} ${isMentioned ? 'message-mentioned' : ''
                }`}
        >
            {showSender && !isCallEventMessage ? (
                <div className="message-sender">
                    {getMessageSenderName(message, selectedRoom, findKnownUserById)}
                </div>
            ) : null}
            <div className="message-bubble-row">
                {!isSentByCurrentUser && senderUser ? (
                    <div className="message-sender-avatar-wrap">
                        {!groupedWithNext ? (
                            <button
                                type="button"
                                className="message-avatar-btn"
                                onClick={() => handleOpenUserProfile(senderUser)}
                                title={getUserDisplayName(senderUser)}
                                aria-label={`View profile of ${getUserDisplayName(senderUser)}`}
                            >
                                {renderUserAvatar(senderUser, 'user-avatar message-bubble-avatar')}
                            </button>
                        ) : (
                            <div className="message-avatar-spacer" aria-hidden="true" />
                        )}
                    </div>
                ) : null}
                {isSentByCurrentUser && !isCallEventMessage ? renderMessageActions(message, isSentByCurrentUser) : null}
                <div
                    className={`message-bubble-wrap ${isCallEventMessage ? 'call-bubble-wrap' : ''}`}
                    onClick={handleBubbleClick}
                    onDoubleClick={handleBubbleDoubleClick}
                >
                    {isCallEventMessage ? renderCallMessageBody(message) : renderMessageBody(message)}
                    {!isCallEventMessage ? renderMessageReactions(message) : null}
                </div>
                {!isSentByCurrentUser && !isCallEventMessage ? renderMessageActions(message, isSentByCurrentUser) : null}
            </div>
            {!isCallEventMessage && message.deliveryStatus !== 'failed' && onToggleTime ? (
                <button
                    type="button"
                    className="message-time-toggle"
                    aria-label={isTimeExpanded ? 'Hide message timestamp' : 'Show message timestamp'}
                    aria-expanded={isTimeExpanded}
                    onClick={() => onToggleTime(messageKey)}
                >
                    {isTimeExpanded ? 'Hide timestamp' : 'Show timestamp'}
                </button>
            ) : null}
            {hasVisibleMessageTime ? (
                <div className="message-time">
                    {message.editedAt ? <span className="message-edited-label">Edited</span> : null}
                    <span>{formatMessageTime(message.timestamp)}</span>
                    {isSentByCurrentUser ? (
                        <>
                            {deliveryStatusLabel ? (
                                <span className={`message-read-status ${message.deliveryStatus ?? ''}`}>
                                    {deliveryStatusLabel}
                                </span>
                            ) : null}
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
            {!isCallEventMessage && isLatestSeenOutgoingMessage ? (
                <div
                    className="message-seen-avatar-row"
                    title={selectedUser ? getUserDisplayName(selectedUser) : undefined}
                >
                    {renderUserAvatar(selectedUser, 'user-avatar message-seen-avatar')}
                </div>
            ) : null}
            {!isCallEventMessage && groupSeenByUsers.length > 0 ? (
                renderGroupSeenBy(message, groupSeenByUsers)
            ) : !isCallEventMessage && groupSeenByLoading ? (
                <div className="message-seen-by-row loading" aria-label="Loading seen by">
                    <span className="message-seen-by-loading-dot" />
                </div>
            ) : null}
        </div>
    );
}

export const MessageItem = React.memo(MessageItemComponent);

export default MessageItem;
