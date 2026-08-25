import type { ChatRoom } from '../types';
import type { ChatMessage, MessageListItem } from '../types/chat.types';
import { formatMessageDateDivider, getLocalDateKey } from './formatUtils';
import { shouldGroupAdjacentMessages } from './messageUtils';

export function buildMessageListItems(
  messages: ChatMessage[],
  selectedRoom: ChatRoom | null,
  currentUserId: number | null,
  unreadDividerMessageId: number | null,
): MessageListItem[] {
  const items: MessageListItem[] = [];
  let previousDateKey = '';

  messages.forEach((message, index) => {
    const dateKey = getLocalDateKey(message.timestamp);
    if (dateKey !== previousDateKey) {
      items.push({
        type: 'date',
        key: `date-${dateKey}-${message.id}`,
        label: formatMessageDateDivider(message.timestamp),
      });
      previousDateKey = dateKey;
    }

    if (unreadDividerMessageId !== null && message.id === unreadDividerMessageId) {
      items.push({ type: 'unread', key: `unread-${message.id}` });
    }

    const previousMessage = messages[index - 1];
    const nextMessage = messages[index + 1];
    const groupedWithPrevious = shouldGroupAdjacentMessages(previousMessage, message);
    const groupedWithNext = shouldGroupAdjacentMessages(message, nextMessage);

    items.push({
      type: 'message',
      key: `${message.clientId ?? message.id}`,
      message,
      groupedWithPrevious,
      groupedWithNext,
      showSender: Boolean(selectedRoom && message.senderId !== currentUserId && !groupedWithPrevious),
    });
  });

  return items;
}
