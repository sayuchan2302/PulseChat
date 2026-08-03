package com.chatapp.dto.response;

import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;

import java.time.LocalDateTime;

public record MessageResponse(
        Long id,
        String content,
        MessageType type,
        String mediaUrl,
        String mediaPublicId,
        String mediaResourceType,
        String mediaFormat,
        Long mediaBytes,
        Integer mediaWidth,
        Integer mediaHeight,
        Double mediaDuration,
        LinkPreviewResponse linkPreview,
        Long senderId,
        String senderUsername,
        String senderFullName,
        Long receiverId,
        Long chatRoomId,
        Boolean read,
        LocalDateTime timestamp,
        String clientId
) {
    public static MessageResponse from(Message message) {
        return new MessageResponse(
                message.getId(),
                message.getContent(),
                message.getType() == null ? MessageType.TEXT : message.getType(),
                message.getMediaUrl(),
                message.getMediaPublicId(),
                message.getMediaResourceType(),
                message.getMediaFormat(),
                message.getMediaBytes(),
                message.getMediaWidth(),
                message.getMediaHeight(),
                message.getMediaDuration(),
                LinkPreviewResponse.from(message),
                message.getSender().getId(),
                message.getSender().getUsername(),
                displayName(message),
                message.getReceiver() == null ? null : message.getReceiver().getId(),
                message.getChatRoom() == null ? null : message.getChatRoom().getId(),
                message.getRead(),
                message.getTimestamp(),
                message.getClientId()
        );
    }

    private static String displayName(Message message) {
        String fullName = message.getSender().getFullName();
        return fullName == null || fullName.isBlank() ? message.getSender().getUsername() : fullName;
    }
}
