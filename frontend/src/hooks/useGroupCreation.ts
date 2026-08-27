import { useCallback } from 'react';
import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, User } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { apiClient } from '../services/api';
import { appendOrUpdateRoom } from '../utils/conversationUtils';

interface Options {
  name: string;
  memberIds: number[];
  minimumInvitedMembers: number;
  selectedUserIdRef: MutableRefObject<number | null>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  stopTyping: (userId: number) => void;
  stopRoomTyping: (roomId: number) => void;
  navigateToRoom: (roomId: number) => void;
  shouldOpenDetails: () => boolean;
  resetMessagePagination: () => void;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setDetailsOpen: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMessageInput: Dispatch<SetStateAction<string>>;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setName: Dispatch<SetStateAction<string>>;
  setMemberIds: Dispatch<SetStateAction<number[]>>;
  setCreating: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
}

export function useGroupCreation(options: Options) {
  const { name, memberIds, minimumInvitedMembers, selectedUserIdRef, selectedRoomIdRef, stopTyping, stopRoomTyping, navigateToRoom, shouldOpenDetails, resetMessagePagination, setRooms, setSelectedUser, setSelectedRoom, setDetailsOpen, setMessages, setMessageInput, setOpen, setName, setMemberIds, setCreating, setError } = options;
  return useCallback(async (event: FormEvent) => {
    event.preventDefault(); const trimmedName = name.trim();
    if (!trimmedName) return;
    if (memberIds.length < minimumInvitedMembers) { setError(`Select at least ${minimumInvitedMembers} friends to create a group.`); return; }
    setCreating(true); setError('');
    try {
      const { data: room } = await apiClient.post<ChatRoom>('/rooms', { name: trimmedName, participantIds: memberIds });
      if (selectedUserIdRef.current !== null) stopTyping(selectedUserIdRef.current);
      if (selectedRoomIdRef.current !== null) stopRoomTyping(selectedRoomIdRef.current);
      setRooms((rooms) => appendOrUpdateRoom(rooms, room)); setSelectedUser(null); selectedUserIdRef.current = null;
      setSelectedRoom(room); selectedRoomIdRef.current = room.id; navigateToRoom(room.id); setDetailsOpen(shouldOpenDetails());
      resetMessagePagination(); setMessages([]); setMessageInput(''); setOpen(false); setName(''); setMemberIds([]);
    } catch (error) { console.error('Failed to create group:', error); setError('Unable to create group.'); }
    finally { setCreating(false); }
  }, [memberIds, minimumInvitedMembers, name, navigateToRoom, resetMessagePagination, selectedRoomIdRef, selectedUserIdRef, setCreating, setDetailsOpen, setError, setMemberIds, setMessageInput, setMessages, setName, setOpen, setRooms, setSelectedRoom, setSelectedUser, shouldOpenDetails, stopRoomTyping, stopTyping]);
}

export default useGroupCreation;
