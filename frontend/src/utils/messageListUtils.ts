import type { ChatRoom, User } from '../types';
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

export function buildLatestRoomSeenByMessageId(
  messages: ChatMessage[],
  seenByMessageId: Record<number, User[]>,
): Record<number, User[]> {
  const result: Record<number, User[]> = {};
  const placedUserIds = new Set<number>();

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.id <= 0 || message.recalled) {
      continue;
    }

    const readers = seenByMessageId[message.id];
    if (!readers?.length) {
      continue;
    }

    const latestReaders = readers.filter((reader) => {
      if (placedUserIds.has(reader.id)) {
        return false;
      }
      placedUserIds.add(reader.id);
      return true;
    });

    if (latestReaders.length > 0) {
      result[message.id] = latestReaders;
    }
  }

  return result;
}
