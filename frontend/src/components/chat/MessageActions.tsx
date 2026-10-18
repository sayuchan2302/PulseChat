import type { Message } from '../../types';
import type { ChatMessage } from '../../types/chat.types';
import { QUICK_REACTION_EMOJIS } from '../../constants/chatConstants';
import { CopyIcon, EditIcon, ForwardIcon, RecallIcon, ReplyIcon, TrashIcon } from '../../icons/ChatIcons';
import { canUseMessageActions, hasCurrentUserReaction } from '../../utils/messageUtils';

interface MessageActionsProps {
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
  message, isSentByCurrentUser, currentUserId, pinnedMessage, canPin = true,
  onReact, onReply, onCopy, onEdit, onDeleteForMe, onRecall, onPin, onForward,
}: MessageActionsProps) {
  const canUseRegularActions = canUseMessageActions(message);
  const canDeleteForMe = message.id > 0 && message.deliveryStatus !== 'failed';
  if (!canUseRegularActions && !canDeleteForMe) return null;
  const canCopyMessage = Boolean(message.content?.trim());

  return (
    <div className="message-actions" aria-label="Message actions">
      {canUseRegularActions ? <>
        <div className="message-quick-reactions">
          {QUICK_REACTION_EMOJIS.map((emoji) => (
            <button key={`${message.id}-${emoji}`} type="button"
              className={`message-action-btn reaction ${hasCurrentUserReaction(message, currentUserId, emoji) ? 'active' : ''}`}
              onClick={() => onReact(message, emoji)} aria-label={`React with ${emoji}`} title={`React with ${emoji}`}>
              {emoji}
            </button>
          ))}
        </div>
        <button type="button" className="message-action-btn" onClick={() => onReply(message)} aria-label="Reply" title="Reply"><ReplyIcon className="message-action-icon" /></button>
        {canCopyMessage ? <button type="button" className="message-action-btn" onClick={() => onCopy(message)} aria-label="Copy" title="Copy"><CopyIcon className="message-action-icon" /></button> : null}
        {isSentByCurrentUser && message.type === 'TEXT' ? <button type="button" className="message-action-btn" onClick={() => onEdit(message)} aria-label="Edit message" title="Edit"><EditIcon className="message-action-icon" /></button> : null}
        {isSentByCurrentUser ? <button type="button" className="message-action-btn danger" onClick={() => onRecall(message)} aria-label="Recall" title="Recall"><RecallIcon className="message-action-icon" /></button> : null}
        {canPin ? <button type="button" className="message-action-btn" onClick={() => onPin(message)} aria-label="Pin message" title={pinnedMessage?.id === message.id ? 'Unpin' : 'Pin'}><span style={{ fontSize: '13px' }}>📌</span></button> : null}
        {!message.recalled && message.type !== 'CALL' ? <button type="button" className="message-action-btn" onClick={() => onForward(message)} aria-label="Forward message" title="Forward"><ForwardIcon className="message-action-icon" /></button> : null}
      </> : null}
      {canDeleteForMe ? <button type="button" className="message-action-btn danger" onClick={() => onDeleteForMe(message)} aria-label="Delete for me" title="Delete for me"><TrashIcon className="message-action-icon" /></button> : null}
    </div>
  );
}
