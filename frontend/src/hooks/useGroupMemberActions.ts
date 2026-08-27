import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatRoom, GroupMemberRole, User } from '../types';
import type { ChatMessage } from '../types/chat.types';
import { apiClient } from '../services/api';

interface Options {
  selectedRoom: ChatRoom | null;
  groupSettingsPendingAction: string | null;
  groupMemberNicknames: Record<number, string>;
  selectedRoomIdRef: MutableRefObject<number | null>;
  setGroupSettingsError: Dispatch<SetStateAction<string>>;
  setGroupSettingsPendingAction: Dispatch<SetStateAction<string | null>>;
  setOpenGroupMemberMenuId: Dispatch<SetStateAction<number | null>>;
  setEditingGroupMemberNicknameId: Dispatch<SetStateAction<number | null>>;
  setGroupMemberNicknames: Dispatch<SetStateAction<Record<number, string>>>;
  setRooms: Dispatch<SetStateAction<ChatRoom[]>>;
  setSelectedRoom: Dispatch<SetStateAction<ChatRoom | null>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  applyRoomMembershipUpdate: (room: ChatRoom) => void;
  navigateToChat: () => void;
}

export function useGroupMemberActions({
  selectedRoom, groupSettingsPendingAction, groupMemberNicknames, selectedRoomIdRef,
  setGroupSettingsError, setGroupSettingsPendingAction, setOpenGroupMemberMenuId,
  setEditingGroupMemberNicknameId, setGroupMemberNicknames, setRooms, setSelectedRoom,
  setMessages, applyRoomMembershipUpdate, navigateToChat,
}: Options) {
  const groupSettingsSaving = groupSettingsPendingAction !== null;
  const handleGroupMemberNicknameChange = useCallback((userId: number, value: string) => {
    setGroupMemberNicknames((nicknames) => ({ ...nicknames, [userId]: value }));
  }, [setGroupMemberNicknames]);
  const handleToggleGroupMemberMenu = useCallback((userId: number) => {
    setGroupSettingsError('');
    setOpenGroupMemberMenuId((currentId) => currentId === userId ? null : userId);
  }, [setGroupSettingsError, setOpenGroupMemberMenuId]);
  const handleStartEditGroupMemberNickname = useCallback((user: User) => {
    setGroupSettingsError(''); setOpenGroupMemberMenuId(null); setEditingGroupMemberNicknameId(user.id);
    setGroupMemberNicknames((nicknames) => ({ ...nicknames, [user.id]: nicknames[user.id] ?? user.nickname ?? '' }));
  }, [setEditingGroupMemberNicknameId, setGroupMemberNicknames, setGroupSettingsError, setOpenGroupMemberMenuId]);
  const handleCancelEditGroupMemberNickname = useCallback((user: User) => {
    setGroupSettingsError(''); setEditingGroupMemberNicknameId(null);
    setGroupMemberNicknames((nicknames) => ({ ...nicknames, [user.id]: user.nickname ?? '' }));
  }, [setEditingGroupMemberNicknameId, setGroupMemberNicknames, setGroupSettingsError]);
  const handleUpdateRoomMemberNickname = useCallback(async (user: User) => {
    if (!selectedRoom || groupSettingsSaving) return;
    const nickname = (groupMemberNicknames[user.id] ?? '').trim();
    if (nickname === (user.nickname ?? '').trim()) return;
    setGroupSettingsPendingAction(`nickname-${user.id}`); setGroupSettingsError('');
    try {
      const response = await apiClient.patch<ChatRoom>(`/rooms/${selectedRoom.id}/members/${user.id}/nickname`, { nickname });
      applyRoomMembershipUpdate(response.data); setEditingGroupMemberNicknameId(null);
    } catch (error) {
      console.error('Failed to update group nickname:', error); setGroupSettingsError('Unable to update nickname.');
    } finally { setGroupSettingsPendingAction(null); }
  }, [applyRoomMembershipUpdate, groupMemberNicknames, groupSettingsSaving, selectedRoom, setEditingGroupMemberNicknameId, setGroupSettingsError, setGroupSettingsPendingAction]);
  const runMemberUpdate = useCallback(async (action: string, request: () => Promise<ChatRoom>, fallback: string) => {
    if (!selectedRoom || groupSettingsSaving) return;
    setGroupSettingsPendingAction(action); setGroupSettingsError('');
    try { applyRoomMembershipUpdate(await request()); }
    catch (error: unknown) {
      console.error(fallback, error);
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
      setGroupSettingsError(message);
    } finally { setGroupSettingsPendingAction(null); }
  }, [applyRoomMembershipUpdate, groupSettingsSaving, selectedRoom, setGroupSettingsError, setGroupSettingsPendingAction]);
  const handleKickRoomMember = useCallback((user: User) => runMemberUpdate(
    `kick-${user.id}`, () => apiClient.delete<ChatRoom>(`/rooms/${selectedRoom!.id}/members/${user.id}`).then((response) => response.data), 'Unable to remove member.',
  ), [runMemberUpdate, selectedRoom]);
  const handleTransferRoomOwner = useCallback((user: User) => {
    setOpenGroupMemberMenuId(null);
    return runMemberUpdate(`owner-${user.id}`, () => apiClient.patch<ChatRoom>(`/rooms/${selectedRoom!.id}/owner`, { ownerId: user.id }).then((response) => response.data), 'Unable to transfer owner.');
  }, [runMemberUpdate, selectedRoom, setOpenGroupMemberMenuId]);
  const handleLeaveSelectedGroup = useCallback(() => runMemberUpdate(
    'leave', () => apiClient.delete<ChatRoom>(`/rooms/${selectedRoom!.id}/members/me`).then((response) => response.data), 'Unable to leave group.',
  ), [runMemberUpdate, selectedRoom]);
  const handleUpdateMemberRole = useCallback((user: User, role: GroupMemberRole) => {
    setOpenGroupMemberMenuId(null);
    return runMemberUpdate(`role-${user.id}`, () => apiClient.patch<ChatRoom>(`/rooms/${selectedRoom!.id}/members/${user.id}/role`, { role }).then((response) => response.data), 'Unable to update member role.');
  }, [runMemberUpdate, selectedRoom, setOpenGroupMemberMenuId]);
  const handleDeleteSelectedGroup = useCallback(async () => {
    if (!selectedRoom || groupSettingsSaving || !window.confirm(`Are you sure you want to dissolve group "${selectedRoom.name}"? All messages and members will be removed.`)) return;
    setGroupSettingsPendingAction('delete-room'); setGroupSettingsError('');
    try {
      await apiClient.delete(`/rooms/${selectedRoom.id}`);
      setRooms((rooms) => rooms.filter((room) => room.id !== selectedRoom.id)); setSelectedRoom(null);
      selectedRoomIdRef.current = null; navigateToChat(); setMessages([]);
    } catch (error: unknown) {
      console.error('Failed to delete group:', error);
      setGroupSettingsError((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Unable to delete group.');
    } finally { setGroupSettingsPendingAction(null); }
  }, [groupSettingsSaving, navigateToChat, selectedRoom, selectedRoomIdRef, setGroupSettingsError, setGroupSettingsPendingAction, setMessages, setRooms, setSelectedRoom]);
  return { handleGroupMemberNicknameChange, handleToggleGroupMemberMenu, handleStartEditGroupMemberNickname, handleCancelEditGroupMemberNickname, handleUpdateRoomMemberNickname, handleKickRoomMember, handleTransferRoomOwner, handleLeaveSelectedGroup, handleUpdateMemberRole, handleDeleteSelectedGroup };
}

export default useGroupMemberActions;
