import type { ChatMessage } from '../../types/chat.types';
import { getGroupedMessageReactions } from '../../utils/messageUtils';

interface MessageReactionsProps {
  message: ChatMessage;
  currentUserId: number | null;
  onReact: (message: ChatMessage, emoji: string) => void;
  onOpenSummary: (message: ChatMessage) => void;
}

export default function MessageReactions({
  message, currentUserId, onReact, onOpenSummary,
}: MessageReactionsProps) {
  const reactions = getGroupedMessageReactions(message, currentUserId);
  if (reactions.length === 0) return null;
  return (
    <div className="message-reactions" aria-label="Message reactions">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`message-reaction-pill ${reaction.reactedByCurrentUser ? 'active' : ''}`}
          onClick={() => onReact(message, reaction.emoji)}
          onContextMenu={(event) => { event.preventDefault(); onOpenSummary(message); }}
          title={`${reaction.title} (Right-click to view details)`}
          aria-label={`${reaction.count} ${reaction.emoji} reactions`}
        >
          <span>{reaction.emoji}</span>
          {reaction.count > 1 ? <small>{reaction.count}</small> : null}
        </button>
      ))}
      <button type="button" className="message-reaction-pill reaction-summary-trigger"
        onClick={() => onOpenSummary(message)} title="View reaction details" aria-label="View reaction details">
        <small style={{ fontSize: '10px', opacity: 0.7 }}>📊</small>
      </button>
    </div>
  );
}
