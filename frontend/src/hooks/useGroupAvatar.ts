import { useCallback } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import type { ChatRoom, MediaAttachment } from '../types';
import type { PendingMedia } from '../types/chat.types';
import { apiClient } from '../services/api';

interface Options {
  selectedRoom: ChatRoom | null;
  groupSettingsPendingAction: string | null;
  acceptedTypes: readonly string[];
  maxBytes: number;
  maxSizeMb: number;
  uploadPendingMedia: (media: PendingMedia) => Promise<MediaAttachment>;
  applyRoomMembershipUpdate: (room: ChatRoom) => void;
  setUploading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
}

export function useGroupAvatar({ selectedRoom, groupSettingsPendingAction, acceptedTypes, maxBytes, maxSizeMb, uploadPendingMedia, applyRoomMembershipUpdate, setUploading, setError }: Options) {
  return useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedRoom || groupSettingsPendingAction !== null) return;
    if (!acceptedTypes.includes(file.type)) { setError('Choose a JPG, PNG, GIF, or WebP image.'); event.currentTarget.value = ''; return; }
    if (file.size > maxBytes) { setError(`Avatar must be ${maxSizeMb}MB or smaller.`); event.currentTarget.value = ''; return; }
    setUploading(true); setError('');
    try {
      const media = await uploadPendingMedia({ file, previewUrl: URL.createObjectURL(file), type: 'IMAGE', resourceType: 'image' });
      if (!media.url) throw new Error('Upload failed');
      const response = await apiClient.patch<ChatRoom>(`/rooms/${selectedRoom.id}`, { avatar: media.url });
      applyRoomMembershipUpdate(response.data);
    } catch (error: unknown) {
      console.error('Failed to upload group avatar:', error);
      setError((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Unable to upload group avatar.');
    } finally { setUploading(false); event.target.value = ''; }
  }, [acceptedTypes, applyRoomMembershipUpdate, groupSettingsPendingAction, maxBytes, maxSizeMb, selectedRoom, setError, setUploading, uploadPendingMedia]);
}

export default useGroupAvatar;
