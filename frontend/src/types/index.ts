export interface User {
  id: number;
  username: string;
  fullName?: string;
  email: string;
  avatar?: string;
  online: boolean;
  unreadCount?: number;
  createdAt: string;
}

export interface Message {
  id: number;
  content: string;
  senderId: number;
  receiverId: number;
  chatRoomId?: number;
  timestamp: string;
  read: boolean;
  clientId?: string | null;
}

export interface PresenceEvent {
  userId: number;
  username: string;
  online: boolean;
}

export interface TypingEvent {
  senderId: number;
  username: string;
  typing: boolean;
}

export interface UnreadCount {
  userId: number;
  unreadCount: number;
}

export interface ReadReceiptEvent {
  readerId: number;
  senderId: number;
  readCount: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface ChatRoom {
  id: number;
  name: string;
  type: 'private' | 'group';
  participants: User[];
  lastMessage?: Message;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
