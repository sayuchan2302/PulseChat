import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudinaryUploadSignature, MediaAttachment } from '../types';
import type { PendingMedia } from '../types/chat.types';
import { apiClient } from '../services/api';
import { useMediaUpload } from './useMediaUpload';

vi.mock('../services/api', () => ({ apiClient: { post: vi.fn(), postForm: vi.fn() } }));

function signature(): CloudinaryUploadSignature {
  return {
    cloudName: 'demo',
    apiKey: 'api-key',
    timestamp: 1700000000,
    signature: 'signed-signature',
    folder: 'chat-app/messages',
    publicId: '00000000-0000-4000-8000-000000000000',
    allowedFormats: 'jpg,png,mp4',
    resourceType: 'auto',
    uploadUrl: 'https://api.cloudinary.com/v1_1/demo/auto/upload',
  };
}

function pendingMedia(): PendingMedia {
  return {
    file: new File(['media-bytes'], 'photo.jpg', { type: 'image/jpeg' }),
    previewUrl: 'blob:preview',
    type: 'IMAGE',
    resourceType: 'image',
  };
}

function renderUpload() {
  return renderHook(() =>
    useMediaUpload(
      (url) => url ?? '',
      () => 'jpg',
      (upload) => ({
        url: upload.secure_url,
        publicId: upload.public_id,
        resourceType: upload.resource_type,
        format: upload.format ?? 'jpg',
        bytes: upload.bytes ?? 0,
      }),
    ),
  );
}

describe('useMediaUpload', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends every signed parameter to Cloudinary so the signature matches', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: signature() } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        secure_url: 'https://res.cloudinary.com/demo/image/upload/chat-app/messages/photo.jpg',
        public_id: 'chat-app/messages/photo',
        resource_type: 'image',
        format: 'jpg',
        bytes: 11,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderUpload();
    let uploaded: MediaAttachment | undefined;
    await act(async () => {
      uploaded = await result.current.uploadPendingMedia(pendingMedia());
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [uploadUrl, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/auto/upload');
    const formData = request.body as FormData;
    expect(formData.get('api_key')).toBe('api-key');
    expect(formData.get('timestamp')).toBe('1700000000');
    expect(formData.get('signature')).toBe('signed-signature');
    expect(formData.get('folder')).toBe('chat-app/messages');
    expect(formData.get('public_id')).toBe('00000000-0000-4000-8000-000000000000');
    expect(formData.get('allowed_formats')).toBe('jpg,png,mp4');
    expect(uploaded?.publicId).toBe('chat-app/messages/photo');
  });

  it('falls back to local storage when the signature request fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('public uploads disabled'));
    vi.mocked(apiClient.postForm).mockResolvedValue({
      data: {
        url: '/uploads/media/local-1.jpg',
        publicId: 'local-1',
        resourceType: 'image',
        format: 'jpg',
        bytes: 11,
      },
    } as never);

    const { result } = renderUpload();
    let uploaded: MediaAttachment | undefined;
    await act(async () => {
      uploaded = await result.current.uploadPendingMedia(pendingMedia());
    });

    expect(uploaded?.publicId).toBe('local-1');
    expect(uploaded?.url).toBe('/uploads/media/local-1.jpg');
  });
});
