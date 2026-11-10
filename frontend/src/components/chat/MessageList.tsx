import { memo, useCallback, useState } from 'react';
import type { MessageListItem } from '../../types/chat.types';
import MessageItem, { type MessageItemProps } from './MessageItem';

interface MessageListProps extends Omit<MessageItemProps, 'item' | 'isTimeExpanded' | 'onToggleTime'> {
  items: MessageListItem[];
}

/** Keeps message DOM ordering and the scroll container unchanged while composing item renderers. */
function MessageListComponent({ items, ...itemProps }: MessageListProps) {
  const [expandedTimeMessageId, setExpandedTimeMessageId] = useState<number | string | null>(null);

  const conversationKey = itemProps.selectedUser
    ? `user-${itemProps.selectedUser.id}`
    : itemProps.selectedRoom
      ? `room-${itemProps.selectedRoom.id}`
      : 'none';

  const [prevConversationKey, setPrevConversationKey] = useState(conversationKey);
  if (prevConversationKey !== conversationKey) {
    setPrevConversationKey(conversationKey);
    setExpandedTimeMessageId(null);
  }

  const handleToggleTime = useCallback((id: number | string) => {
    setExpandedTimeMessageId((current) => (current === id ? null : id));
  }, []);

  return (
    <>
      {items.map((item) => {
        const messageKey =
          item.type === 'message'
            ? item.message.id > 0
              ? item.message.id
              : (item.message.clientId ?? item.key)
            : item.key;
        const isTimeExpanded =
          item.type === 'message' && expandedTimeMessageId === messageKey;

        return (
          <MessageItem
            key={item.key}
            item={item}
            isTimeExpanded={isTimeExpanded}
            onToggleTime={handleToggleTime}
            {...itemProps}
          />
        );
      })}
    </>
  );
}

export const MessageList = memo(MessageListComponent);

export default MessageList;
