import { dbService } from '../services/dbService';
import { useCallback, useRef } from 'react';
import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import { soundService } from '../services/soundService';
import type { ChatRoom, MediaAttachment, MessageType, User } from '../types';
import type { ChatMessage, PendingMedia, RoomSummaryResponse, SendMessagePayload, SendRoomMessagePayload } from '../types/chat.types';
import {
  appendOptimisticMessage, createOptimisticMessage,
  createOptimisticRoomMessage, createReplyFromMessage, createClientId,
  getMediaPayloadFromMessage, getMessageType, markOptimisticMessageSending,
} from '../utils/messageUtils';
import {
  applyConversationPreviewToUser,
  applyConversationPreviewToUsers,
  applyRoomPreviewToRoom,
  applyRoomPreviewToRooms,
} from '../utils/conversationUtils';

interface Options {
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  currentUser: User | null;
  selectedUser: User | null;
  selectedRoom: ChatRoom | null;
  messageInput: string;
  pendingMedia: PendingMedia | null;
  mediaUploading: boolean;
  replyingToMessage: ChatMessage | null;
  roomSummaryLoading: boolean;
  roomSummaryRequestRef: MutableRefObject<number>;
  userSearchQueryRef: MutableRefObject<string>;
  getNextOptimisticMessageId: () => number;
  clearPendingMedia: () => void;
  stopTyping: (userId: number) => void;
  stopRoomTyping: (roomId: number) => void;
  sendOptimisticMessage: (payload: SendMessagePayload) => Promise<void>;
  sendOptimisticRoomMessage: (roomId: number, payload: SendRoomMessagePayload) => Promise<void>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setEmojiPickerOpen: Dispatch<SetStateAction<boolean>>;
  setReplyingToMessage: Dispatch<SetStateAction<ChatMessage | null>>;
  setMediaUploading: Dispatch<SetStateAction<boolean>>;
  setMediaError: Dispatch<SetStateAction<string>>;
  setMessagesError: Dispatch<SetStateAction<string>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setRoomSummary: Dispatch<SetStateAction<RoomSummaryResponse | null>>;
  setRoomSummaryRoomId: Dispatch<SetStateAction<number | null>>;
  setRoomSummaryError: Dispatch<SetStateAction<string>>;
  setRoomSummaryLoading: Dispatch<SetStateAction<boolean>>;
}

export function useMessageSending(options: Options) {
  const {
    selectedUserIdRef, selectedRoomIdRef, currentUser, selectedUser, selectedRoom, messageInput, pendingMedia, mediaUploading,
    replyingToMessage, roomSummaryLoading, roomSummaryRequestRef, userSearchQueryRef,
    getNextOptimisticMessageId, clearPendingMedia, stopTyping, stopRoomTyping,
    sendOptimisticMessage, sendOptimisticRoomMessage, setMessageInput, setEmojiPickerOpen,
    setReplyingToMessage, setMediaUploading, setMediaError, setMessagesError, setMessages,
    setUsers, setFriends, setSelectedUser, setRooms, setSelectedRoom, setRoomSummary,
    setRoomSummaryRoomId, setRoomSummaryError, setRoomSummaryLoading,
  } = options;

  const persisting = useRef(false);
  const handleSendMessage = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const content = messageInput.trim();
    const mediaToSend = pendingMedia;
    if ((!content && !mediaToSend) || mediaUploading || persisting.current || !currentUser || (!selectedUser && !selectedRoom)) return;

    if (!mediaToSend && selectedRoom && /^\/summary$/i.test(content)) {
      if (roomSummaryLoading) return;
      const roomId = selectedRoom.id;
      const requestId = ++roomSummaryRequestRef.current;
      setMessageInput('');
      setEmojiPickerOpen(false);
      setReplyingToMessage(null);
      setRoomSummary(null);
      setRoomSummaryRoomId(roomId);
      setRoomSummaryError('');
      setRoomSummaryLoading(true);
      try {
        const response = await apiClient.post<RoomSummaryResponse>(`/rooms/${roomId}/summaries`);
        if (roomSummaryRequestRef.current === requestId) setRoomSummary(response.data);
      } catch (error) {
        console.error('Failed to summarize room messages:', error);
        if (roomSummaryRequestRef.current === requestId) {
          const responseError = error as { response?: { data?: { message?: string } } };
          setRoomSummaryError(responseError.response?.data?.message || 'Unable to summarize recent messages.');
        }
      } finally {
        if (roomSummaryRequestRef.current === requestId) setRoomSummaryLoading(false);
      }
      return;
    }

    const mediaPayload: MediaAttachment | undefined = undefined;
    const messageType: MessageType = mediaToSend ? mediaToSend.type : 'TEXT';
    const replyTo = createReplyFromMessage(replyingToMessage);
    const replyToMessageId = replyTo?.id;
    const clientId = createClientId();
    const optimistic = selectedUser
      ? createOptimisticMessage(getNextOptimisticMessageId(), currentUser.id, selectedUser.id,
          content, clientId, messageType, mediaPayload, replyTo)
      : createOptimisticRoomMessage(getNextOptimisticMessageId(), currentUser, selectedRoom!.id,
          content, clientId, messageType, mediaPayload, replyTo);
    persisting.current = true;
    setMediaUploading(true);
    const persisted = await dbService.enqueuePendingMessage(currentUser.id, {
      id: clientId, timestamp: Date.now(), optimistic,
      attachment: mediaToSend ? { ...mediaToSend, previewUrl: '' } : undefined,
      conversationKey: selectedUser ? `user_${selectedUser.id}` : `room_${selectedRoom!.id}`,
      destination: selectedUser ? '/messages' : `/rooms/${selectedRoom!.id}/messages`,
      body: { ...(selectedUser ? { receiverId: selectedUser.id } : {}),
        content, clientId, replyToMessageId, type: messageType, media: mediaPayload },
    });
    persisting.current = false;
    setMediaUploading(false);
    if (!persisted) {
      setMessagesError('Unable to save the message on this device. Your draft has been kept.');
      return;
    }
    if (selectedUser ? selectedUserIdRef.current !== selectedUser.id : selectedRoomIdRef.current !== selectedRoom!.id) return;
    setMediaError('');
    setMessagesError('');
    setMessageInput('');
    setEmojiPickerOpen(false);
    setReplyingToMessage(null);
    clearPendingMedia();

    if (selectedUser) {
      const optimisticMessage = optimistic;
      const payload: SendMessagePayload = {
        receiverId: selectedUser.id, content, clientId, replyToMessageId, type: messageType, media: mediaPayload,
      };
      stopTyping(selectedUser.id);
      soundService.playMessageSentSound();
      setMessages((items) => appendOptimisticMessage(items, optimisticMessage));
      setUsers((items) => applyConversationPreviewToUsers(items, optimisticMessage, currentUser.id, !userSearchQueryRef.current.trim()));
      setFriends((items) => applyConversationPreviewToUsers(items, optimisticMessage, currentUser.id, true));
      setSelectedUser((user) => user ? applyConversationPreviewToUser(user, optimisticMessage, currentUser.id) : null);
      void sendOptimisticMessage(payload);
      return;
    }

    if (selectedRoom) {
      const optimisticMessage = optimistic;
      const payload: SendRoomMessagePayload = { content, clientId, replyToMessageId, type: messageType, media: mediaPayload };
      stopRoomTyping(selectedRoom.id);
      soundService.playMessageSentSound();
      setMessages((items) => appendOptimisticMessage(items, optimisticMessage));
      setRooms((items) => applyRoomPreviewToRooms(items, optimisticMessage, currentUser.id, selectedRoom.id));
      setSelectedRoom((room) => room?.id === selectedRoom.id
        ? { ...applyRoomPreviewToRoom(room, optimisticMessage), unreadCount: 0 }
        : room);
      void sendOptimisticRoomMessage(selectedRoom.id, payload);
    }
  }, [
    clearPendingMedia, currentUser, getNextOptimisticMessageId, mediaUploading, messageInput,
    selectedUserIdRef, selectedRoomIdRef, pendingMedia, replyingToMessage, roomSummaryLoading, roomSummaryRequestRef, selectedRoom,
    selectedUser, sendOptimisticMessage, sendOptimisticRoomMessage, setEmojiPickerOpen,
    setFriends, setMediaError, setMediaUploading, setMessageInput, setMessages, setMessagesError,
    setReplyingToMessage, setRoomSummary, setRoomSummaryError, setRoomSummaryLoading,
    setRoomSummaryRoomId, setRooms, setSelectedRoom, setSelectedUser, setUsers, stopRoomTyping,
    stopTyping, userSearchQueryRef,
  ]);

  const handleRetryMessage = useCallback((message: ChatMessage) => {
    const clientId = message.clientId;
    if (!clientId) return;
    if (message.chatRoomId) {
      const payload: SendRoomMessagePayload = {
        content: message.content, clientId, replyToMessageId: message.replyTo?.id,
        type: getMessageType(message), media: getMediaPayloadFromMessage(message),
      };
      setMessages((items) => markOptimisticMessageSending(items, clientId));
      void sendOptimisticRoomMessage(message.chatRoomId, payload);
      return;
    }
    if (!message.receiverId) return;
    const payload: SendMessagePayload = {
      receiverId: message.receiverId, content: message.content, clientId,
      replyToMessageId: message.replyTo?.id, type: getMessageType(message),
      media: getMediaPayloadFromMessage(message),
    };
    setMessages((items) => markOptimisticMessageSending(items, clientId));
    void sendOptimisticMessage(payload);
  }, [sendOptimisticMessage, sendOptimisticRoomMessage, setMessages]);

  return { handleSendMessage, handleRetryMessage };
}
