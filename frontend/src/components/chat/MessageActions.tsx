import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import type { Message } from '../../types';
import type { ChatMessage } from '../../types/chat.types';
import { QUICK_REACTION_EMOJIS } from '../../constants/chatConstants';
import {
  CopyIcon,
  EditIcon,
  EmojiIcon,
  ForwardIcon,
  MoreVerticalIcon,
  PinIcon,
  RecallIcon,
  ReplyIcon,
  TrashIcon,
} from '../../icons/ChatIcons';
import { canUseMessageActions, hasCurrentUserReaction } from '../../utils/messageUtils';

export interface MessageActionsProps {
  message: ChatMessage;
  isSentByCurrentUser: boolean;
  currentUserId: number | null;
  pinnedMessage: Message | null;
  canPin?: boolean;
  onReact: (message: ChatMessage, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
  onRecall: (message: ChatMessage) => void;
  onPin: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
}

export default function MessageActions({
  message,
  isSentByCurrentUser,
  currentUserId,
  pinnedMessage,
  canPin = true,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDeleteForMe,
  onRecall,
  onPin,
  onForward,
}: MessageActionsProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [placement, setPlacement] = useState<{
    vertical: 'up' | 'down';
    horizontal: 'left' | 'right';
  }>({
    vertical: 'up',
    horizontal: isSentByCurrentUser ? 'right' : 'left',
  });
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click outside or scroll to close popovers
  useEffect(() => {
    if (!showReactions && !showOptions) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowReactions(false);
        setShowOptions(false);
      }
    };

    const handleScroll = () => {
      setShowReactions(false);
      setShowOptions(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showReactions, showOptions]);

  const canUseRegularActions = canUseMessageActions(message);
  const canDeleteForMe = message.id > 0 && message.deliveryStatus !== 'failed';
  if (!canUseRegularActions && !canDeleteForMe) return null;
  const canCopyMessage = Boolean(message.content?.trim());
  const isPinned = pinnedMessage?.id === message.id;

  const updatePlacement = (isOptions: boolean) => {
    if (!containerRef.current) return;
    const triggerRect = containerRef.current.getBoundingClientRect();
    const scrollParent = containerRef.current.closest('.messages-container') || document.body;
    const parentRect = scrollParent.getBoundingClientRect();

    const requiredHeight = isOptions ? 260 : 54;
    const spaceAbove = triggerRect.top - parentRect.top;
    const spaceBelow = parentRect.bottom - triggerRect.bottom;

    // Vertical: if space above is less than required height, flip down!
    const vertical = (spaceAbove >= requiredHeight || spaceAbove >= spaceBelow) ? 'up' : 'down';
    const availableHeight = Math.max(0, (vertical === 'up' ? spaceAbove : spaceBelow) - 8);
    setMenuMaxHeight(isOptions ? Math.min(260, Math.max(96, availableHeight)) : null);

    // Horizontal: check boundaries
    const requiredWidth = isOptions ? 160 : 200;
    let horizontal: 'left' | 'right' = isSentByCurrentUser ? 'right' : 'left';

    if (horizontal === 'right' && (triggerRect.right - parentRect.left) < requiredWidth) {
      horizontal = 'left';
    } else if (horizontal === 'left' && (parentRect.right - triggerRect.left) < requiredWidth) {
      horizontal = 'right';
    }

    setPlacement({ vertical, horizontal });
  };

  const handleToggleReactions = () => {
    if (!showReactions) {
      updatePlacement(false);
    }
    setShowReactions((prev) => !prev);
    setShowOptions(false);
  };

  const handleToggleOptions = () => {
    if (!showOptions) {
      updatePlacement(true);
    }
    setShowOptions((prev) => !prev);
    setShowReactions(false);
  };

  const handleReact = (emoji: string) => {
    onReact(message, emoji);
    setShowReactions(false);
  };

  const handleAction = (callback: () => void) => {
    callback();
    setShowOptions(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || (!showReactions && !showOptions)) return;
    event.preventDefault();
    event.stopPropagation();
    const triggerClass = showReactions ? '.react-trigger' : '.options-trigger';
    setShowReactions(false);
    setShowOptions(false);
    containerRef.current?.querySelector<HTMLButtonElement>(triggerClass)?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`message-actions ${isSentByCurrentUser ? 'sent' : 'received'} ${showReactions || showOptions ? 'has-open-menu' : ''}`}
      role="group"
      aria-label="Message actions"
      onKeyDown={handleKeyDown}
    >
      {/* Reaction Popover */}
      {showReactions && canUseRegularActions ? (
        <div
          className={`message-reactions-popover place-${placement.vertical} align-${placement.horizontal}`}
          role="dialog"
          aria-label="Reaction emojis"
        >
          <div className="message-quick-reactions">
            {QUICK_REACTION_EMOJIS.map((emoji) => (
              <button
                key={`${message.id}-${emoji}`}
                type="button"
                className={`message-action-btn reaction ${hasCurrentUserReaction(message, currentUserId, emoji) ? 'active' : ''}`}
                onClick={() => handleReact(emoji)}
                aria-label={`React with ${emoji}`}
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Options Dropdown Menu */}
      {showOptions ? (
        <div
          className={`message-options-dropdown place-${placement.vertical} align-${placement.horizontal}`}
          style={menuMaxHeight !== null ? { maxHeight: menuMaxHeight } : undefined}
          role="menu"
          aria-label="Message options"
        >
          {canUseRegularActions ? (
            <>
              <button
                type="button"
                className="message-option-item"
                onClick={() => handleAction(() => onReply(message))}
                role="menuitem"
              >
                <ReplyIcon className="message-option-icon" />
                <span>Reply</span>
              </button>

              {canCopyMessage ? (
                <button
                  type="button"
                  className="message-option-item"
                  onClick={() => handleAction(() => onCopy(message))}
                  role="menuitem"
                >
                  <CopyIcon className="message-option-icon" />
                  <span>Copy</span>
                </button>
              ) : null}

              {isSentByCurrentUser && message.type === 'TEXT' ? (
                <button
                  type="button"
                  className="message-option-item"
                  onClick={() => handleAction(() => onEdit(message))}
                  role="menuitem"
                >
                  <EditIcon className="message-option-icon" />
                  <span>Edit</span>
                </button>
              ) : null}

              {canPin ? (
                <button
                  type="button"
                  className="message-option-item"
                  onClick={() => handleAction(() => onPin(message))}
                  role="menuitem"
                >
                  <PinIcon className="message-option-icon" />
                  <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                </button>
              ) : null}

              {!message.recalled && message.type !== 'CALL' ? (
                <button
                  type="button"
                  className="message-option-item"
                  onClick={() => handleAction(() => onForward(message))}
                  role="menuitem"
                >
                  <ForwardIcon className="message-option-icon" />
                  <span>Forward</span>
                </button>
              ) : null}

              {isSentByCurrentUser ? (
                <button
                  type="button"
                  className="message-option-item danger"
                  onClick={() => handleAction(() => onRecall(message))}
                  role="menuitem"
                >
                  <RecallIcon className="message-option-icon" />
                  <span>Recall</span>
                </button>
              ) : null}
            </>
          ) : null}

          {canDeleteForMe ? (
            <button
              type="button"
              className="message-option-item danger"
              onClick={() => handleAction(() => onDeleteForMe(message))}
              role="menuitem"
            >
              <TrashIcon className="message-option-icon" />
              <span>Delete for me</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Trigger 1: React Icon */}
      {canUseRegularActions ? (
        <button
          type="button"
          className={`message-action-trigger react-trigger ${showReactions ? 'active' : ''}`}
          onClick={handleToggleReactions}
          aria-label="React to message"
          aria-haspopup="dialog"
          title="React"
          aria-expanded={showReactions}
        >
          <EmojiIcon className="message-trigger-icon" />
        </button>
      ) : null}

      {/* Trigger 2: 3-dots Vertical Icon */}
      <button
        type="button"
        className={`message-action-trigger options-trigger ${showOptions ? 'active' : ''}`}
        onClick={handleToggleOptions}
        aria-label="More options"
        aria-haspopup="menu"
        title="More options"
        aria-expanded={showOptions}
      >
        <MoreVerticalIcon className="message-trigger-icon" />
      </button>
    </div>
  );
}
