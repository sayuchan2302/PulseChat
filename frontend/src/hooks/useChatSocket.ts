import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import type {
    ConnectionStatus,
    Message,
    PresenceEvent,
    TypingEvent,
    ReadReceiptEvent,
    RoomReadReceiptEvent,
    ChatRoom,
    Friendship,
    CallSignalEvent,
} from '../types';

export interface UseChatSocketCallbacks {
    onMessageReceived?: (message: Message) => void;
    onMessageUpdateReceived?: (message: Message) => void;
    onPresenceReceived?: (presence: PresenceEvent) => void;
    onTypingReceived?: (typing: TypingEvent) => void;
    onReadReceiptReceived?: (receipt: ReadReceiptEvent) => void;
    onRoomReadReceiptReceived?: (receipt: RoomReadReceiptEvent) => void;
    onRoomReceived?: (room: ChatRoom) => void;
    onFriendRequestReceived?: (friendship: Friendship) => void;
    onCallSignalReceived?: (event: CallSignalEvent) => void;
}

export function useChatSocket(callbacks: UseChatSocketCallbacks = {}) {
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
        wsService.getConnectionStatus()
    );

    useEffect(() => {
        wsService
            .connect(
                (msg) => callbacks.onMessageReceived?.(msg),
                (pres) => callbacks.onPresenceReceived?.(pres),
                (typing) => callbacks.onTypingReceived?.(typing),
                (rr) => callbacks.onReadReceiptReceived?.(rr),
                (status) => setConnectionStatus(status),
                (room) => callbacks.onRoomReceived?.(room),
                (freq) => callbacks.onFriendRequestReceived?.(freq),
                (msgUpd) => callbacks.onMessageUpdateReceived?.(msgUpd),
                (rrr) => callbacks.onRoomReadReceiptReceived?.(rrr),
                (cs) => callbacks.onCallSignalReceived?.(cs)
            )
            .catch((err) => {
                console.error('Failed to connect to WebSocket in useChatSocket:', err);
            });

        return () => {
            // Do not force disconnect on unmount if app shared
        };
    }, []);

    const sendMessage = useCallback((destination: string, body: unknown): boolean => {
        return wsService.sendMessage(destination, body);
    }, []);

    return {
        connectionStatus,
        isConnected: connectionStatus === 'connected',
        sendMessage,
    };
}

export default useChatSocket;
