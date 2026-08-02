import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_BASE_URL } from '../config/constants';
import type {
  ConnectionStatus,
  Message,
  PresenceEvent,
  ReadReceiptEvent,
  TypingEvent,
} from '../types';

type MessageHandler = (message: Message) => void;
type PresenceHandler = (presence: PresenceEvent) => void;
type TypingHandler = (typing: TypingEvent) => void;
type ReadReceiptHandler = (receipt: ReadReceiptEvent) => void;
type ConnectionStatusHandler = (status: ConnectionStatus) => void;

export class WebSocketService {
  private client: Client | null = null;
  private connected = false;
  private connectingPromise: Promise<void> | null = null;
  private manuallyDisconnecting = false;
  private status: ConnectionStatus = 'offline';
  private onMessageReceived: MessageHandler | null = null;
  private onPresenceReceived: PresenceHandler | null = null;
  private onTypingReceived: TypingHandler | null = null;
  private onReadReceiptReceived: ReadReceiptHandler | null = null;
  private onConnectionStatusChanged: ConnectionStatusHandler | null = null;

  connect(
    onMessageReceived: MessageHandler,
    onPresenceReceived?: PresenceHandler,
    onTypingReceived?: TypingHandler,
    onReadReceiptReceived?: ReadReceiptHandler,
    onConnectionStatusChanged?: ConnectionStatusHandler
  ): Promise<void> {
    this.onMessageReceived = onMessageReceived;
    this.onPresenceReceived = onPresenceReceived ?? null;
    this.onTypingReceived = onTypingReceived ?? null;
    this.onReadReceiptReceived = onReadReceiptReceived ?? null;
    this.onConnectionStatusChanged = onConnectionStatusChanged ?? null;

    if (this.connected) {
      this.updateStatus('connected');
      return Promise.resolve();
    }

    if (this.connectingPromise) {
      this.onConnectionStatusChanged?.(this.status);
      return this.connectingPromise;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      this.updateStatus('offline');
      return Promise.reject(new Error('Missing auth token'));
    }

    this.manuallyDisconnecting = false;
    this.updateStatus(this.isBrowserOffline() ? 'offline' : 'connecting');

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
        this.updateStatus('connected');

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
        this.updateStatus(this.client?.active ? 'reconnecting' : 'offline');
        reject(new Error(frame.headers['message']));
      };

      this.client.onWebSocketError = () => {
        this.connected = false;
        this.updateStatus(this.isBrowserOffline() ? 'offline' : 'reconnecting');
      };

      this.client.onWebSocketClose = () => {
        this.connected = false;
        this.connectingPromise = null;
        this.updateStatus(
          this.manuallyDisconnecting || !this.client?.active
            ? 'offline'
            : this.isBrowserOffline()
              ? 'offline'
              : 'reconnecting'
        );
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
    this.manuallyDisconnecting = true;

    if (this.client) {
      this.client.deactivate();
    }

    this.client = null;
    this.connected = false;
    this.connectingPromise = null;
    this.updateStatus('offline');
    this.onMessageReceived = null;
    this.onPresenceReceived = null;
    this.onTypingReceived = null;
    this.onReadReceiptReceived = null;
    this.onConnectionStatusChanged = null;
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
