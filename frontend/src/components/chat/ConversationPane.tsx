import type { ComponentProps, RefObject } from 'react';
import type { ChatMessage, RoomSummaryResponse } from '../../types/chat.types';
import type { Message } from '../../types';
import { MESSAGE_SKELETON_KEYS } from '../../constants/chatConstants';
import { CloseIcon, FriendsIcon, PaperclipIcon } from '../../icons/ChatIcons';
import ConversationHeader from './ConversationHeader';
import MessageInput, { type MessageInputProps } from './MessageInput';
import MessageList from './MessageList';

type HeaderProps = ComponentProps<typeof ConversationHeader>;
type MessageListProps = ComponentProps<typeof MessageList>;

export interface ConversationPaneProps {
  open: boolean;
  header: HeaderProps;
  pinnedMessage: Message | null;
  messages: ChatMessage[];
  messagesLoading: boolean;
  messagesError: string;
  hasMoreMessages: boolean;
  olderMessagesLoading: boolean;
  messageListProps: MessageListProps;
  messageInputProps: MessageInputProps;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isDraggingFile: boolean;
  onSetDraggingFile: (dragging: boolean) => void;
  onMarkScrollIntent: () => void;
  onMessagesScroll: () => void;
  onFileSelected: (file: File) => void;
  onRetryMessages: () => void;
  onLoadOlderMessages: () => void;
  onGoToPinnedMessage: () => void;
  onUnpinMessage: () => void;
  typingIndicatorLabel: string;
  roomSummaryRoomId: number | null;
  selectedRoomId: number | null;
  roomSummary: RoomSummaryResponse | null;
  roomSummaryLoading: boolean;
  roomSummaryError: string;
  onDismissRoomSummary: () => void;
}

export function ConversationPane({
  open,
  header,
  pinnedMessage,
  messages,
  messagesLoading,
  messagesError,
  hasMoreMessages,
  olderMessagesLoading,
  messageListProps,
  messageInputProps,
  messagesContainerRef,
  messagesEndRef,
  isDraggingFile,
  onSetDraggingFile,
  onMarkScrollIntent,
  onMessagesScroll,
  onFileSelected,
  onRetryMessages,
  onLoadOlderMessages,
  onGoToPinnedMessage,
  onUnpinMessage,
  typingIndicatorLabel,
  roomSummaryRoomId,
  selectedRoomId,
  roomSummary,
  roomSummaryLoading,
  roomSummaryError,
  onDismissRoomSummary,
}: ConversationPaneProps) {
  if (!open) {
    return <div className="no-chat-selected"><span className="no-chat-selected-icon" aria-hidden="true"><FriendsIcon className="no-chat-selected-icon-svg" /></span><strong>Choose a conversation</strong><p>Select a friend or group to start chatting.</p></div>;
  }

  const showSummary = roomSummaryRoomId === selectedRoomId && (roomSummaryLoading || roomSummaryError || roomSummary);
  return <>
    <ConversationHeader {...header} />
    {pinnedMessage ? <div className="pinned-message-banner">
      <button type="button" className="pinned-message-banner-body" onClick={onGoToPinnedMessage} aria-label="Go to pinned message">
        <span className="pinned-banner-icon">📌</span><span className="pinned-banner-content"><span className="pinned-banner-label">Pinned message</span><span className="pinned-banner-text">{pinnedMessage.recalled ? 'Message recalled' : pinnedMessage.content || '📎 Media'}</span></span>
      </button>
      <button type="button" className="pinned-banner-close" onClick={onUnpinMessage} aria-label="Unpin message" title="Unpin">×</button>
    </div> : null}
    <div
      ref={messagesContainerRef}
      className={`messages-container ${isDraggingFile ? 'dragging-over' : ''}`}
      aria-busy={messagesLoading || olderMessagesLoading}
      onPointerDown={onMarkScrollIntent}
      onScroll={onMessagesScroll}
      onTouchMove={onMarkScrollIntent}
      onWheel={onMarkScrollIntent}
      onDragOver={(event) => { event.preventDefault(); if (!isDraggingFile) onSetDraggingFile(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) onSetDraggingFile(false); }}
      onDrop={(event) => { event.preventDefault(); onSetDraggingFile(false); const file = event.dataTransfer.files?.[0]; if (file) onFileSelected(file); }}
    >
      {isDraggingFile ? <div className="chat-drag-drop-overlay"><PaperclipIcon className="chat-drag-drop-icon" /><span>Drop file here to send</span></div> : null}
      {messagesLoading ? MESSAGE_SKELETON_KEYS.map((key, index) => <div key={key} className={`message message-skeleton ${index % 2 === 0 ? 'received' : 'sent'}`} aria-hidden="true"><div className="skeleton-bubble" /></div>) : null}
      {!messagesLoading && messagesError ? <div className="message-state error-state"><span>{messagesError}</span><button type="button" className="retry-btn" onClick={onRetryMessages}>Retry</button></div> : null}
      {!messagesLoading && !messagesError && messages.length === 0 ? <div className="message-state">No messages yet.</div> : null}
      {!messagesLoading && !messagesError && messages.length > 0 ? <>
        {hasMoreMessages ? <button type="button" className="older-messages-btn" onClick={onLoadOlderMessages} disabled={olderMessagesLoading}>{olderMessagesLoading ? 'Loading older messages...' : 'Load older messages'}</button> : null}
        <MessageList {...messageListProps} />
      </> : null}
      {!messagesLoading && typingIndicatorLabel ? <div className="typing-indicator">{typingIndicatorLabel}</div> : null}
      <div ref={messagesEndRef} />
    </div>
    {showSummary ? <section className="room-summary-card" aria-live="polite" aria-label="Private chat summary">
      <div className="room-summary-card-header"><div><span>Private summary</span>{roomSummary ? <small>{roomSummary.messageCount} recent messages</small> : null}</div><button type="button" className="room-summary-close-btn" onClick={onDismissRoomSummary} disabled={roomSummaryLoading} aria-label="Close summary" title="Close summary"><CloseIcon className="room-summary-close-icon" /></button></div>
      {roomSummaryLoading ? <div className="room-summary-loading">Summarizing recent messages...</div> : null}
      {roomSummaryError ? <div className="room-summary-error">{roomSummaryError}</div> : null}
      {roomSummary ? <div className="room-summary-content">{roomSummary.summary}</div> : null}
    </section> : null}
    <MessageInput {...messageInputProps} />
  </>;
}

export default ConversationPane;
