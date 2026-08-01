import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_BASE_URL } from '../config/constants';
import type { Message } from '../types';

type MessageHandler = (message: Message) => void;

export class WebSocketService {
  private client: Client | null = null;
  private connected = false;
  private connectingPromise: Promise<void> | null = null;
  private onMessageReceived: MessageHandler | null = null;

  connect(onMessageReceived: MessageHandler): Promise<void> {
    this.onMessageReceived = onMessageReceived;

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
}

export const wsService = new WebSocketService();
