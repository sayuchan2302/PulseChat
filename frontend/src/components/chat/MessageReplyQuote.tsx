import type { MessageReply } from '../../types';

interface MessageReplyQuoteProps {
  reply?: MessageReply | null;
}

export default function MessageReplyQuote({ reply }: MessageReplyQuoteProps) {
  if (!reply) return null;
  return (
    <div className="message-reply-quote">
      <span>{reply.senderName}</span>
      <p>{reply.recalled ? 'Message recalled' : reply.content || 'Message'}</p>
    </div>
  );
}
