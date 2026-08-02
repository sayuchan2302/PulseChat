import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_BASE_URL } from '../config/constants';
import type { Message, PresenceEvent, ReadReceiptEvent, TypingEvent } from '../types';

type MessageHandler = (message: Message) => void;
type PresenceHandler = (presence: PresenceEvent) => void;
type TypingHandler = (typing: TypingEvent) => void;
type ReadReceiptHandler = (receipt: ReadReceiptEvent) => void;

export class WebSocketService {
  private client: Client | null = null;
  private connected = false;
  private connectingPromise: Promise<void> | null = null;
  private onMessageReceived: MessageHandler | null = null;
  private onPresenceReceived: PresenceHandler | null = null;
  private onTypingReceived: TypingHandler | null = null;
  private onReadReceiptReceived: ReadReceiptHandler | null = null;

  connect(
    onMessageReceived: MessageHandler,
    onPresenceReceived?: PresenceHandler,
    onTypingReceived?: TypingHandler,
    onReadReceiptReceived?: ReadReceiptHandler
  ): Promise<void> {
    this.onMessageReceived = onMessageReceived;
    this.onPresenceReceived = onPresenceReceived ?? null;
    this.onTypingReceived = onTypingReceived ?? null;
    this.onReadReceiptReceived = onReadReceiptReceived ?? null;

    if (this.connected) {
      return Promise.resolve();
    }

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return Promise.reject(new Error('Missing auth token'));
    }

    this.connectingPromise = new Promise((resolve, reject) => {
      this.client = new Client({
        webSocketFactory: () => new SockJS(WS_BASE_URL),
        connectHeaders: {
          Authorization: `Bearer ${token}`,
        },
        debug: (str) => {
          console.log('STOMP: ' + str);
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      this.client.onConnect = () => {
        console.log('Connected to WebSocket');
        this.connected = true;
        this.connectingPromise = null;

        this.client?.subscribe('/user/queue/messages', (message) => {
          this.handleIncomingMessage(message.body);
        });

        this.client?.subscribe('/topic/presence', (message) => {
          this.handleIncomingPresence(message.body);
        });

        this.client?.subscribe('/user/queue/typing', (message) => {
          this.handleIncomingTyping(message.body);
        });

        this.client?.subscribe('/user/queue/read-receipts', (message) => {
          this.handleIncomingReadReceipt(message.body);
        });

        resolve();
      };

      this.client.onStompError = (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
        this.connected = false;
        this.connectingPromise = null;
        reject(new Error(frame.headers['message']));
      };

      this.client.onWebSocketClose = () => {
        this.connected = false;
        this.connectingPromise = null;
      };

      this.client.activate();
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
    if (this.client) {
      this.client.deactivate();
    }

    this.client = null;
    this.connected = false;
    this.connectingPromise = null;
    this.onMessageReceived = null;
    this.onPresenceReceived = null;
    this.onTypingReceived = null;
    this.onReadReceiptReceived = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleIncomingMessage(body: string) {
    try {
      const message = JSON.parse(body) as Message;
      this.onMessageReceived?.(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
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
}

export const wsService = new WebSocketService();
