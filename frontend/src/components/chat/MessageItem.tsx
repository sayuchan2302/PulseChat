import React from 'react';
import type { User, ChatRoom } from '../../types';
import type { ChatMessage, MessageListItem } from '../../types/chat.types';
import { isCallMessage, getMessageSenderUser, getMessageSenderName, getDeliveryStatusLabel } from '../../utils/messageUtils';
import { formatMessageTime } from '../../utils/formatUtils';
import { getUserDisplayName } from '../../utils/userUtils';
import { renderUserAvatar } from '../../utils/renderUtils';

export interface MessageItemProps {
    item: MessageListItem;
    currentUser: User | null;
    selectedUser: User | null;
    selectedRoom: ChatRoom | null;
    unreadDividerRef: React.RefObject<HTMLDivElement | null>;
    latestSeenOutgoingMessageId: number;
    latestOutgoingMessageId: number | string;
    latestRoomSeenByByMessageId: Record<number, User[]>;
    seenByLoadingMessageIds: number[];
    detailsOpen: boolean;
    rightSidebarTab: 'details' | 'search';
    messageSearchQuery: string;
    messageSearchResultIds: Set<number>;
    highlightedMessageId: number | null;
    renderCallMessageBody: (msg: ChatMessage) => React.ReactNode;
    findKnownUserById: (id: number) => User | null;
    handleOpenUserProfile: (user: User) => void;
    renderMessageActions: (msg: ChatMessage, isSent: boolean) => React.ReactNode;
    renderMessageBody: (msg: ChatMessage) => React.ReactNode;
    renderMessageReactions: (msg: ChatMessage) => React.ReactNode;
    handleRetryMessage: (msg: ChatMessage) => void;
    renderGroupSeenBy: (msg: ChatMessage, users: User[]) => React.ReactNode;
}

export function MessageItem({
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
    const isSentByCurrentUser = message.senderId === currentUser?.id;
    const hasVisibleMessageTime = !groupedWithNext || message.deliveryStatus === 'failed';
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
    const isCallEventMessage = isCallMessage(message);

    if (isCallEventMessage) {
        return (
            <div
                key={item.key}
                data-message-id={message.id > 0 ? message.id : undefined}
                className={`message call-system ${isMessageSearchMatch ? 'message-search-match' : ''
                    } ${highlightedMessageId === message.id ? 'highlighted' : ''}`}
            >
                {renderCallMessageBody(message)}
            </div>
        );
    }

    const isMentioned = Boolean(
        !isSentByCurrentUser && (
            (currentUser && message.mentionedUserIds?.includes(currentUser.id)) ||
            (currentUser && message.mentionedUsernames?.includes(currentUser.username)) ||
            (selectedRoom && message.content && /@all\b/i.test(message.content))
        )
    );
    const senderUser = !isSentByCurrentUser
        ? getMessageSenderUser(message, selectedUser, selectedRoom, findKnownUserById)
        : null;

    return (
        <div
            key={item.key}
            data-message-id={message.id > 0 ? message.id : undefined}
            className={`message ${isSentByCurrentUser ? 'sent' : 'received'} ${message.deliveryStatus ?? ''
                } ${groupedWithPrevious ? 'grouped-with-previous' : ''} ${groupedWithNext ? 'grouped-with-next' : ''
                } ${hasVisibleMessageTime ? 'has-visible-time' : ''} ${isMessageSearchMatch ? 'message-search-match' : ''
                } ${highlightedMessageId === message.id ? 'highlighted message-highlight-pulse' : ''} ${isMentioned ? 'message-mentioned' : ''
                }`}
        >
            {showSender ? (
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
                <div className="message-bubble-wrap">
                    {renderMessageBody(message)}
                    {renderMessageActions(message, isSentByCurrentUser)}
                    {renderMessageReactions(message)}
                </div>
            </div>
            {hasVisibleMessageTime ? (
                <div className="message-time">
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
            {isLatestSeenOutgoingMessage ? (
                <div className="message-seen-avatar-row">
                    {renderUserAvatar(selectedUser, 'user-avatar message-seen-avatar')}
                </div>
            ) : null}
            {groupSeenByUsers.length > 0 ? (
                renderGroupSeenBy(message, groupSeenByUsers)
            ) : groupSeenByLoading ? (
                <div className="message-seen-by-row loading" aria-label="Loading seen by">
                    <span className="message-seen-by-loading-dot" />
                </div>
            ) : null}
        </div>
    );
}

export default MessageItem;
