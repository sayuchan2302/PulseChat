import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { apiClient } from '../services/api';
import type { ChatRoom, GroupInviteResponse } from '../types';

interface Options {
  selectedRoom: ChatRoom | null;
  groupInviteData: GroupInviteResponse | null;
  inviteRevoking: boolean;
  setInviteModalOpen: Dispatch<SetStateAction<boolean>>;
  setInviteLoading: Dispatch<SetStateAction<boolean>>;
  setInviteRevoking: Dispatch<SetStateAction<boolean>>;
  setInviteError: Dispatch<SetStateAction<string>>;
  setInviteCopied: Dispatch<SetStateAction<boolean>>;
  setGroupInviteData: Dispatch<SetStateAction<GroupInviteResponse | null>>;
}

export function useGroupInvite(options: Options) {
  const {
    selectedRoom, groupInviteData, inviteRevoking, setInviteModalOpen, setInviteLoading,
    setInviteRevoking, setInviteError, setInviteCopied, setGroupInviteData,
  } = options;

  const handleOpenInviteModal = useCallback(async () => {
    if (!selectedRoom) return;
    setInviteModalOpen(true);
    setInviteLoading(true);
    setInviteError('');
    setInviteCopied(false);
    try {
      const response = await apiClient.get<GroupInviteResponse>(`/rooms/${selectedRoom.id}/invite-link`);
      setGroupInviteData(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch invite link:', error);
      const responseError = error as { response?: { data?: { message?: string } } };
      setInviteError(responseError.response?.data?.message || 'Unable to load invite link.');
    } finally {
      setInviteLoading(false);
    }
  }, [selectedRoom, setGroupInviteData, setInviteCopied, setInviteError, setInviteLoading, setInviteModalOpen]);

  const handleRevokeInviteLink = useCallback(async () => {
    if (!selectedRoom || inviteRevoking) return;
    setInviteRevoking(true);
    setInviteError('');
    setInviteCopied(false);
    try {
      const response = await apiClient.post<GroupInviteResponse>(`/rooms/${selectedRoom.id}/invite-link/revoke`);
      setGroupInviteData(response.data);
    } catch (error: unknown) {
      console.error('Failed to reset invite link:', error);
      const responseError = error as { response?: { data?: { message?: string } } };
      setInviteError(responseError.response?.data?.message || 'Unable to reset invite link.');
    } finally {
      setInviteRevoking(false);
    }
  }, [inviteRevoking, selectedRoom, setGroupInviteData, setInviteCopied, setInviteError, setInviteRevoking]);

  const getGroupInviteUrl = useCallback(() => {
    const code = groupInviteData?.inviteCode || selectedRoom?.inviteCode;
    const relativeOrAbsoluteUrl = groupInviteData?.inviteUrl?.trim() ||
      (code ? `/invite/${encodeURIComponent(code)}` : '');
    return relativeOrAbsoluteUrl
      ? new URL(relativeOrAbsoluteUrl, window.location.origin).toString()
      : '';
  }, [groupInviteData, selectedRoom?.inviteCode]);

  const handleCopyInviteLink = useCallback(async () => {
    const url = getGroupInviteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    } catch {
      setInviteError('Failed to copy to clipboard.');
    }
  }, [getGroupInviteUrl, setInviteCopied, setInviteError]);

  return { handleOpenInviteModal, handleRevokeInviteLink, getGroupInviteUrl, handleCopyInviteLink };
}
