import type { KeyboardEvent, MouseEvent } from 'react';
import type { MessageReply } from '../../types';

interface MessageReplyQuoteProps {
  reply?: MessageReply | null;
  onJumpToMessage?: (messageId: number) => void;
}

export default function MessageReplyQuote({ reply, onJumpToMessage }: MessageReplyQuoteProps) {
  if (!reply) return null;

  const canJump = Boolean(onJumpToMessage && reply.id > 0);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canJump || !onJumpToMessage) return;
    event.stopPropagation();
    onJumpToMessage(reply.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canJump || !onJumpToMessage) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onJumpToMessage(reply.id);
    }
  };

  return (
    <div
      className="message-reply-quote"
      role={canJump ? 'button' : undefined}
      tabIndex={canJump ? 0 : undefined}
      onClick={canJump ? handleClick : undefined}
      onKeyDown={canJump ? handleKeyDown : undefined}
      aria-label={canJump ? `Jump to replied message from ${reply.senderName}` : undefined}
    >
      <span className="reply-quote-sender">{reply.senderName}</span>
      <p className="reply-quote-content">{reply.recalled ? 'Message recalled' : reply.content || 'Message'}</p>
    </div>
  );
}
