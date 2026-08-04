package com.chatapp.dto.response;

import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

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
        MessageReplyResponse replyTo,
        List<MessageReactionResponse> reactions,
        Boolean recalled,
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
        boolean recalled = Boolean.TRUE.equals(message.getRecalled());
        return new MessageResponse(
                message.getId(),
                recalled ? "" : message.getContent(),
                message.getType() == null ? MessageType.TEXT : message.getType(),
                recalled ? null : message.getMediaUrl(),
                recalled ? null : message.getMediaPublicId(),
                recalled ? null : message.getMediaResourceType(),
                recalled ? null : message.getMediaFormat(),
                recalled ? null : message.getMediaBytes(),
                recalled ? null : message.getMediaWidth(),
                recalled ? null : message.getMediaHeight(),
                recalled ? null : message.getMediaDuration(),
                recalled ? null : LinkPreviewResponse.from(message),
                MessageReplyResponse.from(message.getReplyToMessage()),
                message.getReactions()
                        .stream()
                        .sorted(Comparator.comparing(MessageResponse::reactionSortKey))
                        .map(MessageReactionResponse::from)
                        .toList(),
                recalled,
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

    private static Long reactionSortKey(com.chatapp.model.MessageReaction reaction) {
        return reaction.getId() == null ? Long.MAX_VALUE : reaction.getId();
    }

    private static String displayName(Message message) {
        String fullName = message.getSender().getFullName();
        return fullName == null || fullName.isBlank() ? message.getSender().getUsername() : fullName;
    }
}
