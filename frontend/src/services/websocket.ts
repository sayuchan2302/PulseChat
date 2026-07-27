import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { WS_BASE_URL } from '../config/constants';

export class WebSocketService {
  private client: Client | null = null;
  private connected = false;

  connect(onMessageReceived: (message: any) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new Client({
        webSocketFactory: () => new SockJS(WS_BASE_URL),
        connectHeaders: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
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

        this.client?.subscribe('/user/queue/messages', (message) => {
          const body = JSON.parse(message.body);
          onMessageReceived(body);
        });

        this.client?.subscribe('/topic/public', (message) => {
          const body = JSON.parse(message.body);
          onMessageReceived(body);
        });

        resolve();
      };

      this.client.onStompError = (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
        reject(new Error(frame.headers['message']));
      };

      this.client.activate();
    });
  }

  sendMessage(destination: string, body: any) {
    if (this.client && this.connected) {
      this.client.publish({
        destination,
        body: JSON.stringify(body),
      });
    }
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const wsService = new WebSocketService();
