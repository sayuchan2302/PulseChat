import { useCallback, useState } from 'react';
import { apiClient } from '../services/api';
import type { ChatRoom, GroupInviteResponse } from '../types';

interface Options {
  selectedRoom: ChatRoom | null;
}

/** Owns the invite-link modal state and the copy/revoke actions for the selected room. */
export function useGroupInvite({ selectedRoom }: Options) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [groupInviteData, setGroupInviteData] = useState<GroupInviteResponse | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteRevoking, setInviteRevoking] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState('');

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
  }, [selectedRoom]);

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
  }, [inviteRevoking, selectedRoom]);

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
  }, [getGroupInviteUrl]);

  return {
    inviteModalOpen,
    setInviteModalOpen,
    groupInviteData,
    inviteLoading,
    inviteRevoking,
    inviteCopied,
    inviteError,
    handleOpenInviteModal,
    handleRevokeInviteLink,
    getGroupInviteUrl,
    handleCopyInviteLink,
  };
}
