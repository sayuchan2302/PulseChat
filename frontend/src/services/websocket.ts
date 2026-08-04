import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_BASE_URL } from '../config/constants';
import { getValidAccessToken } from './api';
import type {
  ChatRoom,
  ConnectionStatus,
  Friendship,
  Message,
  PresenceEvent,
  ReadReceiptEvent,
  TypingEvent,
} from '../types';

type MessageHandler = (message: Message) => void;
type MessageUpdateHandler = (message: Message) => void;
type PresenceHandler = (presence: PresenceEvent) => void;
type TypingHandler = (typing: TypingEvent) => void;
type ReadReceiptHandler = (receipt: ReadReceiptEvent) => void;
type ConnectionStatusHandler = (status: ConnectionStatus) => void;
type RoomHandler = (room: ChatRoom) => void;
type FriendRequestHandler = (friendship: Friendship) => void;

export class WebSocketService {
  private client: Client | null = null;
  private connected = false;
  private connectingPromise: Promise<void> | null = null;
  private manuallyDisconnecting = false;
  private connectionAttemptId = 0;
  private status: ConnectionStatus = 'offline';
  private onMessageReceived: MessageHandler | null = null;
  private onMessageUpdateReceived: MessageUpdateHandler | null = null;
  private onPresenceReceived: PresenceHandler | null = null;
  private onTypingReceived: TypingHandler | null = null;
  private onReadReceiptReceived: ReadReceiptHandler | null = null;
  private onConnectionStatusChanged: ConnectionStatusHandler | null = null;
  private onRoomReceived: RoomHandler | null = null;
  private onFriendRequestReceived: FriendRequestHandler | null = null;

  connect(
    onMessageReceived: MessageHandler,
    onPresenceReceived?: PresenceHandler,
    onTypingReceived?: TypingHandler,
    onReadReceiptReceived?: ReadReceiptHandler,
    onConnectionStatusChanged?: ConnectionStatusHandler,
    onRoomReceived?: RoomHandler,
    onFriendRequestReceived?: FriendRequestHandler,
    onMessageUpdateReceived?: MessageUpdateHandler
  ): Promise<void> {
    this.onMessageReceived = onMessageReceived;
    this.onMessageUpdateReceived = onMessageUpdateReceived ?? null;
    this.onPresenceReceived = onPresenceReceived ?? null;
    this.onTypingReceived = onTypingReceived ?? null;
    this.onReadReceiptReceived = onReadReceiptReceived ?? null;
    this.onConnectionStatusChanged = onConnectionStatusChanged ?? null;
    this.onRoomReceived = onRoomReceived ?? null;
    this.onFriendRequestReceived = onFriendRequestReceived ?? null;

    if (this.connected) {
      this.updateStatus('connected');
      return Promise.resolve();
    }

    if (this.connectingPromise) {
      this.onConnectionStatusChanged?.(this.status);
      return this.connectingPromise;
    }

    this.manuallyDisconnecting = false;
    const attemptId = ++this.connectionAttemptId;
    this.updateStatus(this.isBrowserOffline() ? 'offline' : 'connecting');

    this.connectingPromise = getValidAccessToken().then((token) => {
      if (!this.isActiveConnectionAttempt(attemptId)) {
        return;
      }

      if (!token) {
        this.connectingPromise = null;
        this.updateStatus('offline');
        throw new Error('Missing auth token');
      }

      return new Promise<void>((resolve, reject) => {
        const client = new Client({
          webSocketFactory: () => new SockJS(WS_BASE_URL),
          connectHeaders: {
            Authorization: `Bearer ${token}`,
          },
          beforeConnect: async () => {
            try {
              if (!this.isActiveConnectionAttempt(attemptId)) {
                throw new Error('WebSocket connection cancelled');
              }

              const refreshedToken = await getValidAccessToken();
              if (!refreshedToken) {
                throw new Error('Missing auth token');
              }

              client.connectHeaders = {
                Authorization: `Bearer ${refreshedToken}`,
              };
            } catch (error) {
              if (this.isCurrentClient(client, attemptId)) {
                this.connected = false;
                this.updateStatus('offline');
              }
              throw error;
            }
          },
          debug: (str) => {
            console.log('STOMP: ' + str);
          },
          reconnectDelay: 5000,
          heartbeatIncoming: 4000,
          heartbeatOutgoing: 4000,
        });
        this.client = client;

        client.onConnect = () => {
          if (!this.isCurrentClient(client, attemptId)) {
            void client.deactivate();
            resolve();
            return;
          }

          console.log('Connected to WebSocket');
          this.connected = true;
          this.connectingPromise = null;
          this.updateStatus('connected');

          client.subscribe('/user/queue/messages', (message) => {
            this.handleIncomingMessage(message.body);
          });

          client.subscribe('/user/queue/message-updates', (message) => {
            this.handleIncomingMessageUpdate(message.body);
          });

          client.subscribe('/topic/presence', (message) => {
            this.handleIncomingPresence(message.body);
          });

          client.subscribe('/user/queue/typing', (message) => {
            this.handleIncomingTyping(message.body);
          });

          client.subscribe('/user/queue/read-receipts', (message) => {
            this.handleIncomingReadReceipt(message.body);
          });

          client.subscribe('/user/queue/rooms', (message) => {
            this.handleIncomingRoom(message.body);
          });

          client.subscribe('/user/queue/friend-requests', (message) => {
            this.handleIncomingFriendRequest(message.body);
          });

          resolve();
        };

        client.onStompError = (frame) => {
          if (!this.isCurrentClient(client, attemptId)) {
            return;
          }

          console.error('Broker reported error: ' + frame.headers['message']);
          console.error('Additional details: ' + frame.body);
          this.connected = false;
          this.connectingPromise = null;
          this.updateStatus(client.active ? 'reconnecting' : 'offline');
          reject(new Error(frame.headers['message']));
        };

        client.onWebSocketError = () => {
          if (!this.isCurrentClient(client, attemptId)) {
            return;
          }

          this.connected = false;
          this.updateStatus(this.isBrowserOffline() ? 'offline' : 'reconnecting');
        };

        client.onWebSocketClose = () => {
          if (!this.isCurrentClient(client, attemptId)) {
            return;
          }

          this.connected = false;
          this.connectingPromise = null;
          this.updateStatus(
            this.manuallyDisconnecting || !client.active
              ? 'offline'
              : this.isBrowserOffline()
                ? 'offline'
                : 'reconnecting'
          );
        };

        client.activate();
      });
    }).catch((error) => {
      if (this.connectionAttemptId === attemptId) {
        this.connectingPromise = null;
      }
      throw error;
    });

    return this.connectingPromise;
  }

  sendMessage(destination: string, body: unknown): boolean {
    if (!this.client || !this.connected) {
      return false;
    }

    try {
      this.client.publish({
        destination,
        body: JSON.stringify(body),
      });
      return true;
    } catch (error) {
      console.error('Failed to publish WebSocket message:', error);
      return false;
    }
  }

  disconnect() {
    this.manuallyDisconnecting = true;
    this.connectionAttemptId += 1;

    if (this.client) {
      this.client.deactivate();
    }

    this.client = null;
    this.connected = false;
    this.connectingPromise = null;
    this.updateStatus('offline');
    this.onMessageReceived = null;
    this.onMessageUpdateReceived = null;
    this.onPresenceReceived = null;
    this.onTypingReceived = null;
    this.onReadReceiptReceived = null;
    this.onConnectionStatusChanged = null;
    this.onRoomReceived = null;
    this.onFriendRequestReceived = null;
  }

  private isActiveConnectionAttempt(attemptId: number) {
    return this.connectionAttemptId === attemptId && !this.manuallyDisconnecting;
  }

  private isCurrentClient(client: Client, attemptId: number) {
    return this.client === client && this.isActiveConnectionAttempt(attemptId);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  private updateStatus(status: ConnectionStatus) {
    if (this.status === status) {
      this.onConnectionStatusChanged?.(status);
      return;
    }

    this.status = status;
    this.onConnectionStatusChanged?.(status);
  }

  private isBrowserOffline() {
    return typeof navigator !== 'undefined' && !navigator.onLine;
  }

  private handleIncomingMessage(body: string) {
    try {
      const message = JSON.parse(body) as Message;
      this.onMessageReceived?.(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleIncomingMessageUpdate(body: string) {
    try {
      const message = JSON.parse(body) as Message;
      this.onMessageUpdateReceived?.(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message update:', error);
    }
  }

  private handleIncomingPresence(body: string) {
    try {
      const presence = JSON.parse(body) as PresenceEvent;
      this.onPresenceReceived?.(presence);
    } catch (error) {
      console.error('Failed to parse WebSocket presence event:', error);
    }
  }

  private handleIncomingTyping(body: string) {
    try {
      const typing = JSON.parse(body) as TypingEvent;
      this.onTypingReceived?.(typing);
    } catch (error) {
      console.error('Failed to parse WebSocket typing event:', error);
    }
  }

  private handleIncomingReadReceipt(body: string) {
    try {
      const receipt = JSON.parse(body) as ReadReceiptEvent;
      this.onReadReceiptReceived?.(receipt);
    } catch (error) {
      console.error('Failed to parse WebSocket read receipt event:', error);
    }
  }

  private handleIncomingRoom(body: string) {
    try {
      const room = JSON.parse(body) as ChatRoom;
      this.onRoomReceived?.(room);
    } catch (error) {
      console.error('Failed to parse WebSocket room event:', error);
    }
  }

  private handleIncomingFriendRequest(body: string) {
    try {
      const friendship = JSON.parse(body) as Friendship;
      this.onFriendRequestReceived?.(friendship);
    } catch (error) {
      console.error('Failed to parse WebSocket friend request event:', error);
    }
  }
}

export const wsService = new WebSocketService();
