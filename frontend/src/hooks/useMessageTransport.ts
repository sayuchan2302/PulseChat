import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import { wsService } from '../services/websocket';
import type { ChatRoom, Message, User } from '../types';
import type { ChatMessage, SendMessagePayload, SendRoomMessagePayload } from '../types/chat.types';
import { appendOrReconcileMessage, markOptimisticMessageFailed } from '../utils/messageUtils';
import {
  applyConversationPreviewToUser,
  applyConversationPreviewToUsers,
  applyRoomPreviewToRoom,
  applyRoomPreviewToRooms,
} from '../utils/conversationUtils';

const PRIVATE_MESSAGE_DESTINATION = '/app/chat.send';
const GROUP_MESSAGE_DESTINATION_PREFIX = '/app/rooms';

interface Options {
  currentUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  userSearchQueryRef: MutableRefObject<string>;
  clearOptimisticSendTimeout: (clientId: string) => void;
  scheduleOptimisticSendTimeout: (clientId: string) => void;
  addIncomingSharedContent: (message: Message) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setFriends: Dispatch<SetStateAction<User[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
}

export function useMessageTransport(options: Options) {
  const {
    currentUserIdRef, selectedRoomIdRef, userSearchQueryRef, clearOptimisticSendTimeout,
    scheduleOptimisticSendTimeout, addIncomingSharedContent, setMessages, setUsers, setFriends,
    setSelectedUser, setRooms, setSelectedRoom,
  } = options;

  const sendOptimisticMessage = useCallback(async (payload: SendMessagePayload) => {
    if (wsService.sendMessage(PRIVATE_MESSAGE_DESTINATION, payload)) {
      scheduleOptimisticSendTimeout(payload.clientId);
      return;
    }

    try {
      const response = await apiClient.post<Message>('/messages', payload);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((messages) => appendOrReconcileMessage(messages, response.data));
      setUsers((users) => applyConversationPreviewToUsers(
        users, response.data, currentUserIdRef.current, !userSearchQueryRef.current.trim()
      ));
      setFriends((friends) => applyConversationPreviewToUsers(
        friends, response.data, currentUserIdRef.current, true
      ));
      setSelectedUser((user) => user
        ? applyConversationPreviewToUser(user, response.data, currentUserIdRef.current)
        : null);
      addIncomingSharedContent(response.data);
    } catch (error) {
      console.error('Failed to send message:', error);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((messages) => markOptimisticMessageFailed(messages, payload.clientId));
    }
  }, [
    addIncomingSharedContent, clearOptimisticSendTimeout, currentUserIdRef,
    scheduleOptimisticSendTimeout, setFriends, setMessages, setSelectedUser, setUsers,
    userSearchQueryRef,
  ]);

  const sendOptimisticRoomMessage = useCallback(async (
    roomId: number,
    payload: SendRoomMessagePayload,
  ) => {
    if (wsService.sendMessage(`${GROUP_MESSAGE_DESTINATION_PREFIX}/${roomId}/send`, payload)) {
      scheduleOptimisticSendTimeout(payload.clientId);
      return;
    }

    try {
      const response = await apiClient.post<Message>(`/rooms/${roomId}/messages`, payload);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((messages) => appendOrReconcileMessage(messages, response.data));
      setRooms((rooms) => applyRoomPreviewToRooms(
        rooms, response.data, currentUserIdRef.current, selectedRoomIdRef.current
      ));
      setSelectedRoom((room) => {
        if (!room || room.id !== response.data.chatRoomId) return room;
        return { ...applyRoomPreviewToRoom(room, response.data), unreadCount: 0 };
      });
      addIncomingSharedContent(response.data);
    } catch (error) {
      console.error('Failed to send group message:', error);
      clearOptimisticSendTimeout(payload.clientId);
      setMessages((messages) => markOptimisticMessageFailed(messages, payload.clientId));
    }
  }, [
    addIncomingSharedContent, clearOptimisticSendTimeout, currentUserIdRef,
    scheduleOptimisticSendTimeout, selectedRoomIdRef, setMessages, setRooms, setSelectedRoom,
  ]);

  return { sendOptimisticMessage, sendOptimisticRoomMessage };
}
