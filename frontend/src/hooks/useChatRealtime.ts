import { useEffect, useRef } from 'react';
import type {
  CallSignalEvent,
  ChatRoom,
  ConnectionStatus,
  Friendship,
  Message,
  PresenceEvent,
  ReadReceiptEvent,
  RoomReadReceiptEvent,
  TypingEvent,
} from '../types';
import { wsService } from '../services/websocket';

export interface ChatRealtimeHandlers {
  onConnect: () => void;
  onMessage: (message: Message) => void;
  onPresence: (presence: PresenceEvent) => void;
  onTyping: (typing: TypingEvent) => void;
  onReadReceipt: (receipt: ReadReceiptEvent) => void;
  onConnectionStatus: (status: ConnectionStatus) => void;
  onRoom: (room: ChatRoom) => void;
  onFriendship: (friendship: Friendship) => void;
  onMessageUpdate: (message: Message) => void;
  onRoomReadReceipt: (receipt: RoomReadReceiptEvent) => void;
  onCallSignal: (event: CallSignalEvent) => void;
  onDisconnect: () => void;
}

/**
 * Owns the lifetime of the app-wide chat subscription. Handler refs intentionally
 * keep callbacks current without reconnecting when ChatPage state changes.
 */
export function useChatRealtime(
  currentUserId: number | null | undefined,
  handlers: ChatRealtimeHandlers,
) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let active = true;
    handlersRef.current.onConnect();

    wsService.connect(
      (message) => {
        if (active) handlersRef.current.onMessage(message);
      },
      (presence) => {
        if (active) handlersRef.current.onPresence(presence);
      },
      (typing) => {
        if (active) handlersRef.current.onTyping(typing);
      },
      (receipt) => {
        if (active) handlersRef.current.onReadReceipt(receipt);
      },
      (status) => {
        if (active) handlersRef.current.onConnectionStatus(status);
      },
      (room) => {
        if (active) handlersRef.current.onRoom(room);
      },
      (friendship) => {
        if (active) handlersRef.current.onFriendship(friendship);
      },
      (message) => {
        if (active) handlersRef.current.onMessageUpdate(message);
      },
      (receipt) => {
        if (active) handlersRef.current.onRoomReadReceipt(receipt);
      },
      (event) => {
        if (active) handlersRef.current.onCallSignal(event);
      },
    ).catch((error) => {
      if (active) {
        console.error('Failed to connect WebSocket:', error);
      }
    });

    return () => {
      active = false;
      handlersRef.current.onDisconnect();
      wsService.disconnect();
    };
  }, [currentUserId]);
}

export default useChatRealtime;
