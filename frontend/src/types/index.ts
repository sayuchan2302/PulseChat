export type UserFriendshipStatus =
  | 'none'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'accepted'
  | 'declined';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface User {
  id: number;
  username: string;
  fullName?: string;
  email: string;
  avatar?: string;
  online: boolean;
  unreadCount?: number;
  friendshipStatus?: UserFriendshipStatus;
  friendshipId?: number;
  lastMessageContent?: string;
  lastMessageAt?: string;
  lastMessageSenderId?: number;
  createdAt: string;
}

export interface Message {
  id: number;
  content: string;
  senderId: number;
  senderUsername?: string;
  senderFullName?: string;
  receiverId?: number | null;
  chatRoomId?: number | null;
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

export interface Friendship {
  id: number;
  requester: User;
  receiver: User;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FriendshipSummary {
  incomingCount: number;
  outgoingCount: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface ChatRoom {
  id: number;
  name: string;
  type: 'private' | 'group';
  participants: User[];
  unreadCount?: number;
  lastMessageContent?: string;
  lastMessageAt?: string;
  lastMessageSenderId?: number;
  lastMessageSenderName?: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
