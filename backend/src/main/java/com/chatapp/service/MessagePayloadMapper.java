package com.chatapp.service;

import com.chatapp.dto.request.MediaAttachmentRequest;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import org.springframework.util.StringUtils;

/** Normalizes, validates, and applies the content fields of a message. */
final class MessagePayloadMapper {
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;
    private static final long MAX_VIDEO_BYTES = 50L * 1024 * 1024;
    private static final long MAX_FILE_BYTES = 50L * 1024 * 1024;
    private static final String IMAGE_RESOURCE_TYPE = "image";
    private static final String VIDEO_RESOURCE_TYPE = "video";

    private MessagePayloadMapper() {
    }

    static String normalizeContent(String content) {
        return content == null ? "" : content.trim();
    }

    static MessageType normalizeType(MessageType type) {
        return type == null ? MessageType.TEXT : type;
    }

    static void validate(MessageType type, String content, MediaAttachmentRequest media) {
        if (type == MessageType.TEXT) {
            if (!StringUtils.hasText(content)) {
                throw new AppException(ErrorCode.INVALID_MESSAGE_CONTENT);
            }
            return;
        }

        if (type == MessageType.CALL) {
            throw new AppException(ErrorCode.INVALID_MESSAGE_CONTENT);
        }

        validateMedia(type, media);
    }

    static void apply(
            Message message,
            String content,
            MessageType type,
            MediaAttachmentRequest media,
            LinkPreviewMetadata linkPreview) {
        message.setType(type);
        message.setContent(content);

        if (type == MessageType.TEXT) {
            applyLinkPreview(message, linkPreview);
            return;
        }

        if (type == MessageType.CALL || media == null) {
            return;
        }

        message.setMediaUrl(media.url().trim());
        message.setMediaPublicId(media.publicId().trim());
        message.setMediaResourceType(media.resourceType().trim().toLowerCase());
        message.setMediaFormat(normalizeOptionalMediaValue(media.format()));
        message.setMediaBytes(media.bytes());
        message.setMediaWidth(media.width());
        message.setMediaHeight(media.height());
        message.setMediaDuration(media.duration());
    }

    private static void validateMedia(MessageType type, MediaAttachmentRequest media) {
        if (media == null
                || !StringUtils.hasText(media.url())
                || !StringUtils.hasText(media.publicId())
                || !StringUtils.hasText(media.resourceType())) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }

        if (type == MessageType.IMAGE && !IMAGE_RESOURCE_TYPE.equalsIgnoreCase(media.resourceType())) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }

        if (type == MessageType.VIDEO && !VIDEO_RESOURCE_TYPE.equalsIgnoreCase(media.resourceType())) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }

        if (media.bytes() == null) {
            return;
        }

        long maxBytes = type == MessageType.IMAGE ? MAX_IMAGE_BYTES
                : type == MessageType.VIDEO ? MAX_VIDEO_BYTES
                        : MAX_FILE_BYTES;
        if (media.bytes() > maxBytes) {
            throw new AppException(ErrorCode.INVALID_MEDIA_MESSAGE);
        }
    }

    private static void applyLinkPreview(Message message, LinkPreviewMetadata linkPreview) {
        message.setLinkPreviewUrl(null);
        message.setLinkPreviewTitle(null);
        message.setLinkPreviewDescription(null);
        message.setLinkPreviewImageUrl(null);
        message.setLinkPreviewDomain(null);

        if (linkPreview == null) {
            return;
        }

        message.setLinkPreviewUrl(linkPreview.url());
        message.setLinkPreviewTitle(linkPreview.title());
        message.setLinkPreviewDescription(linkPreview.description());
        message.setLinkPreviewImageUrl(linkPreview.imageUrl());
        message.setLinkPreviewDomain(linkPreview.domain());
    }

    private static String normalizeOptionalMediaValue(String value) {
        return StringUtils.hasText(value) ? value.trim().toLowerCase() : null;
    }
}
