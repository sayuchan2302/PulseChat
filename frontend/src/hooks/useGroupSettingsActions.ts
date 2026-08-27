import { useCallback } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { ChatRoom } from '../types';
import { apiClient } from '../services/api';

interface Options {
  selectedRoom: ChatRoom | null;
  pendingAction: string | null;
  groupName: string;
  selectedAddMemberIds: number[];
  applyRoomMembershipUpdate: (room: ChatRoom) => void;
  setPendingAction: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setEditingName: Dispatch<SetStateAction<boolean>>;
  setSelectedAddMemberIds: Dispatch<SetStateAction<number[]>>;
  setAddMembersModalOpen: Dispatch<SetStateAction<boolean>>;
}

export function useGroupSettingsActions({
  selectedRoom, pendingAction, groupName, selectedAddMemberIds, applyRoomMembershipUpdate,
  setPendingAction, setError, setEditingName, setSelectedAddMemberIds, setAddMembersModalOpen,
}: Options) {
  const handleUpdateGroupSettingsName = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();
    if (!selectedRoom || pendingAction !== null) return;
    const name = groupName.trim();
    if (!name || name === selectedRoom.name.trim()) { setEditingName(false); return; }
    setPendingAction('rename'); setError('');
    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${selectedRoom.id}`, { name });
      applyRoomMembershipUpdate(response.data); setEditingName(false);
    } catch (error) {
      console.error('Failed to update group:', error); setError('Unable to update group.');
    } finally { setPendingAction(null); }
  }, [applyRoomMembershipUpdate, groupName, pendingAction, selectedRoom, setEditingName, setError, setPendingAction]);
  const handleAddRoomMembers = useCallback(async () => {
    if (!selectedRoom || selectedAddMemberIds.length === 0 || pendingAction !== null) return;
    setPendingAction('add'); setError('');
    try {
      const response = await apiClient.post<ChatRoom>(`/rooms/${selectedRoom.id}/members`, { participantIds: selectedAddMemberIds });
      setSelectedAddMemberIds([]); applyRoomMembershipUpdate(response.data); setAddMembersModalOpen(false);
    } catch (error) {
      console.error('Failed to add group members:', error); setError('Unable to add members.');
    } finally { setPendingAction(null); }
  }, [applyRoomMembershipUpdate, pendingAction, selectedAddMemberIds, selectedRoom, setAddMembersModalOpen, setError, setPendingAction, setSelectedAddMemberIds]);
  return { handleUpdateGroupSettingsName, handleAddRoomMembers };
}

export default useGroupSettingsActions;
