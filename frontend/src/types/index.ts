export type UserFriendshipStatus =
  | 'none'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'accepted'
  | 'declined';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO';

export interface MediaAttachment {
  url: string;
  publicId: string;
  resourceType: 'image' | 'video';
  format?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

export interface LinkPreview {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  domain?: string | null;
}

export interface MessageReply {
  id: number;
  content: string;
  type?: MessageType;
  senderId: number;
  senderName: string;
  recalled?: boolean;
}

export interface MessageReaction {
  id: number;
  emoji: string;
  userId: number;
  username: string;
  fullName?: string;
  createdAt: string;
}

export interface User {
  id: number;
  username: string;
  fullName?: string;
  nickname?: string;
  email: string;
  avatar?: string;
  bio?: string;
  online: boolean;
  lastSeenAt?: string;
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
  type?: MessageType;
  mediaUrl?: string | null;
  mediaPublicId?: string | null;
  mediaResourceType?: 'image' | 'video' | null;
  mediaFormat?: string | null;
  mediaBytes?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaDuration?: number | null;
  linkPreview?: LinkPreview | null;
  replyTo?: MessageReply | null;
  reactions?: MessageReaction[];
  recalled?: boolean;
  senderId: number;
  senderUsername?: string;
  senderFullName?: string;
  receiverId?: number | null;
  chatRoomId?: number | null;
  timestamp: string;
  read: boolean;
  clientId?: string | null;
}

export interface MessagePage {
  items: Message[];
  hasMore: boolean;
  nextBefore?: number | null;
}

export interface CloudinaryUploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: string;
  uploadUrl: string;
}

export interface PresenceEvent {
  userId: number;
  username: string;
  online: boolean;
  lastSeenAt?: string;
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
  ownerId?: number | null;
  ownerUsername?: string | null;
  ownerFullName?: string | null;
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
