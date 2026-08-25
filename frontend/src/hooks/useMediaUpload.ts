import { useCallback } from 'react';
import type { CloudinaryUploadSignature, MediaAttachment } from '../types';
import type { CloudinaryUploadResult, LocalMediaUploadResult, PendingMedia } from '../types/chat.types';
import { apiClient } from '../services/api';

export function useMediaUpload(getMediaUrl: (url?: string | null) => string, getFileFormat: (file: File) => string | null | undefined, cloudinaryResultToMedia: (result: CloudinaryUploadResult) => MediaAttachment) {
  const uploadToLocalMedia = useCallback(async (file: File, duration?: number): Promise<MediaAttachment> => {
    const formData = new FormData(); formData.append('file', file);
    const { data } = await apiClient.postForm<LocalMediaUploadResult>('/media/upload', formData);
    return { url: getMediaUrl(data.url), publicId: data.publicId, resourceType: data.resourceType, format: data.format ?? getFileFormat(file), bytes: data.bytes ?? file.size, duration: duration ?? data.duration };
  }, [getFileFormat, getMediaUrl]);
  const uploadPendingMedia = useCallback(async (media: PendingMedia): Promise<MediaAttachment> => {
    try {
      const { data: signature } = await apiClient.post<CloudinaryUploadSignature>('/media/upload-signature');
      if (!signature.cloudName || signature.cloudName === 'chat-app' || signature.apiKey === '933935263295315') return await uploadToLocalMedia(media.file, media.mediaDuration);
      const formData = new FormData(); formData.append('file', media.file); formData.append('api_key', signature.apiKey); formData.append('timestamp', String(signature.timestamp)); formData.append('signature', signature.signature); formData.append('folder', signature.folder);
      const response = await fetch(signature.uploadUrl, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Cloudinary upload failed');
      const result = await response.json() as CloudinaryUploadResult;
      if (!result.secure_url || !result.public_id || result.resource_type !== media.resourceType) throw new Error('Cloudinary upload response is invalid');
      return { ...cloudinaryResultToMedia(result), format: result.format ?? getFileFormat(media.file), bytes: result.bytes ?? media.file.size, duration: media.mediaDuration ?? result.duration };
    } catch { return await uploadToLocalMedia(media.file, media.mediaDuration); }
  }, [cloudinaryResultToMedia, getFileFormat, uploadToLocalMedia]);
  return { uploadToLocalMedia, uploadPendingMedia };
}
