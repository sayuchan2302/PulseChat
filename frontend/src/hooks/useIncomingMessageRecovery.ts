import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import type { ChatRoom, Message, User } from '../types';
import {
  appendOrUpdateRoom,
  applyConversationPreviewToUser,
  applyRoomPreviewToRoom,
  compareUsersByChatActivity,
} from '../utils/conversationUtils';

interface Options {
  realtimeActiveRef: MutableRefObject<boolean>;
  usersRef: MutableRefObject<User[]>;
  roomsRef: MutableRefObject<ChatRoom[]>;
  userSearchQueryRef: MutableRefObject<string>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
}

export function useIncomingMessageRecovery({
  realtimeActiveRef, usersRef, roomsRef, userSearchQueryRef, setUsers, setRooms,
}: Options) {
  const restoreMissingRoom = useCallback((message: Message, isIncoming: boolean, isActive: boolean) => {
    if (!message.chatRoomId || roomsRef.current.some((room) => room.id === message.chatRoomId)) return;
    void apiClient.get<ChatRoom>(`/rooms/${message.chatRoomId}`).then((response) => {
      if (!realtimeActiveRef.current) return;
      const preview = applyRoomPreviewToRoom(response.data, message);
      setRooms((rooms) => appendOrUpdateRoom(rooms, {
        ...preview,
        unreadCount: isIncoming && !isActive ? (preview.unreadCount ?? 0) + 1 : preview.unreadCount ?? 0,
      }));
    }).catch((error) => console.error('Failed to restore group conversation:', error));
  }, [realtimeActiveRef, roomsRef, setRooms]);

  const restoreMissingDirectSender = useCallback((message: Message, currentUserId: number | null) => {
    if (!message.senderUsername || userSearchQueryRef.current.trim() ||
      usersRef.current.some((user) => user.id === message.senderId)) return;
    void apiClient.get<User>(`/users/${encodeURIComponent(message.senderUsername)}`).then((response) => {
      if (!realtimeActiveRef.current) return;
      setUsers((users) => users.some((user) => user.id === response.data.id) ? users : [
        ...users,
        applyConversationPreviewToUser(response.data, message, currentUserId),
      ].sort(compareUsersByChatActivity));
    }).catch((error) => console.error('Failed to load direct message sender:', error));
  }, [realtimeActiveRef, setUsers, userSearchQueryRef, usersRef]);

  return { restoreMissingRoom, restoreMissingDirectSender };
}
