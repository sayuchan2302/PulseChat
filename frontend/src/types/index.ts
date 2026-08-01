export interface User {
  id: number;
  username: string;
  email: string;
  avatar?: string;
  online: boolean;
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
}

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
