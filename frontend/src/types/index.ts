export type UserFriendshipStatus =
  | 'none'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'accepted'
  | 'declined';

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'CALL';

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
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
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
  callId?: number | null;
  callType?: CallType | null;
  callStatus?: CallStatus | null;
  callDurationSeconds?: number | null;
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
  roomId?: number | null;
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

export interface RoomReadReceiptEvent {
  roomId: number;
  readerId: number;
  readAt: string;
}

export interface MessageSeenByResponse {
  messageId: number;
  roomId: number;
  seenBy: User[];
}

export type CallType = 'AUDIO' | 'VIDEO';

export type CallStatus =
  | 'RINGING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'MISSED'
  | 'ENDED'
  | 'CANCELED'
  | 'BUSY';

export type CallRecipientRole = 'CALLER' | 'RECEIVER';

export type CallSignalType =
  | 'CALL_INVITE'
  | 'CALL_ACCEPT'
  | 'CALL_REJECT'
  | 'CALL_CANCEL'
  | 'CALL_END'
  | 'CALL_MISSED'
  | 'CALL_BUSY'
  | 'WEBRTC_OFFER'
  | 'WEBRTC_ANSWER'
  | 'ICE_CANDIDATE'
  | 'SCREEN_SHARE_START'
  | 'SCREEN_SHARE_STOP';

export interface CallSignalPayload {
  eventType: CallSignalType;
  callId?: number;
  receiverId?: number;
  callType?: CallType;
  sdp?: string;
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface CallSignalEvent {
  eventType: CallSignalType;
  callId: number;
  callType: CallType;
  status: CallStatus;
  recipientRole?: CallRecipientRole | null;
  caller: User;
  receiver: User;
  fromUser: User;
  sdp?: string | null;
  candidate?: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  occurredAt: string;
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
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
  createdAt: string;
}

export interface ConversationSetting {
  id: number;
  userId: number;
  targetUserId?: number | null;
  chatRoomId?: number | null;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}
