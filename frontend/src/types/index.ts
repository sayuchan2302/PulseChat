export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  online: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  receiverId: string;
  chatRoomId?: string;
  timestamp: string;
  read: boolean;
}

export interface ChatRoom {
  id: string;
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
