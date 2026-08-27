import type { MessageListItem } from '../../types/chat.types';
import MessageItem, { type MessageItemProps } from './MessageItem';

interface MessageListProps extends Omit<MessageItemProps, 'item'> {
  items: MessageListItem[];
}

/** Keeps message DOM ordering and the scroll container unchanged while composing item renderers. */
export default function MessageList({ items, ...itemProps }: MessageListProps) {
  return <>{items.map((item) => <MessageItem key={item.key} item={item} {...itemProps} />)}</>;
}
