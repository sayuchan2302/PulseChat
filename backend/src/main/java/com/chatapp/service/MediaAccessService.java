package com.chatapp.service;

import com.chatapp.dto.request.MediaAttachmentRequest;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.repository.MessageRepository;
import com.chatapp.repository.ChatRoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;

@Service
@RequiredArgsConstructor
public class MediaAccessService {
    private final LocalMediaStorageService storage;
    private final MessageRepository messageRepository;
    private final ChatRoomRepository chatRoomRepository;

    @Transactional(readOnly = true)
    public void requireAccess(String username, String filename) {
        storage.validateFilename(filename);
        if (username.equals(storage.getOwner(filename))) return;
        String publicId = filename.substring(0, filename.lastIndexOf('.'));
        if (messageRepository.countAccessibleLocalMedia(username, publicId, filename) == 0
                && chatRoomRepository.countAccessibleLocalAvatars(username, filename) == 0) {
            throw new AppException(ErrorCode.FORBIDDEN);
        }
    }

    public static boolean isLocalMediaUrl(String url) {
        if (url == null || url.isBlank()) return false;
        try {
            String path = URI.create(url.trim()).getPath();
            return path != null && path.contains("/uploads/media/");
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    public void validateAvatar(String username, String url) {
        if (!isLocalMediaUrl(url)) return;
        String path = URI.create(url.trim()).getPath();
        requireAccess(username, path.substring(path.indexOf("/uploads/media/") + "/uploads/media/".length()));
    }

    /** Prevent attaching somebody else's URL to a new message to manufacture access. */
    public void validateAttachment(String username, MediaAttachmentRequest media) {
        if (media == null || media.url() == null) return;
        try {
            String path = URI.create(media.url().trim()).getPath();
            if (path == null) throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
            int marker = path.indexOf("/uploads/media/");
            if (marker < 0) return; // External media has a separate storage policy.
            String filename = path.substring(marker + "/uploads/media/".length());
            storage.validateFilename(filename);
            if (!filename.substring(0, filename.lastIndexOf('.')).equals(media.publicId())) {
                throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
            }
            requireAccess(username, filename);
        } catch (IllegalArgumentException exception) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }
    }
}
