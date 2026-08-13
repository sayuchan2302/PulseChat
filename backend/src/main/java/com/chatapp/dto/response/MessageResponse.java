package com.chatapp.dto.response;

import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
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
        Long callId,
        CallType callType,
        CallStatus callStatus,
        Long callDurationSeconds,
        Boolean recalled,
        Long senderId,
        String senderUsername,
        String senderFullName,
        Long receiverId,
        Long chatRoomId,
        Boolean read,
        LocalDateTime timestamp,
        String clientId,
        Long forwardedFromId,
        String forwardedFromSenderName) {
    public static MessageResponse from(Message message) {
        boolean recalled = Boolean.TRUE.equals(message.getRecalled());
        CallSession callSession = message.getCallSession();
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
                callSession == null ? null : callSession.getId(),
                callSession == null ? null : callSession.getType(),
                callSession == null ? null : callSession.getStatus(),
                callSession == null ? null : callDurationSeconds(callSession),
                recalled,
                message.getSender().getId(),
                message.getSender().getUsername(),
                displayName(message),
                message.getReceiver() == null ? null : message.getReceiver().getId(),
                message.getChatRoom() == null ? null : message.getChatRoom().getId(),
                message.getRead(),
                message.getTimestamp(),
                message.getClientId(),
                message.getForwardedFrom() == null ? null : message.getForwardedFrom().getId(),
                message.getForwardedFrom() == null ? null : forwardedSenderName(message.getForwardedFrom()));
    }

    private static Long reactionSortKey(com.chatapp.model.MessageReaction reaction) {
        return reaction.getId() == null ? Long.MAX_VALUE : reaction.getId();
    }

    private static Long callDurationSeconds(CallSession callSession) {
        if (callSession.getStartedAt() == null || callSession.getEndedAt() == null) {
            return null;
        }

        long seconds = java.time.Duration.between(callSession.getStartedAt(), callSession.getEndedAt()).getSeconds();
        return Math.max(seconds, 0);
    }

    private static String displayName(Message message) {
        if (message.getChatRoom() != null) {
            String nickname = message.getChatRoom()
                    .getMembers()
                    .stream()
                    .filter(member -> member.getUser().getId().equals(message.getSender().getId()))
                    .map(ChatRoomMember::getNickname)
                    .filter(value -> value != null && !value.isBlank())
                    .findFirst()
                    .orElse(null);
            if (nickname != null) {
                return nickname;
            }
        }

        String fullName = message.getSender().getFullName();
        return fullName == null || fullName.isBlank() ? message.getSender().getUsername() : fullName;
    }

    private static String forwardedSenderName(Message original) {
        String fullName = original.getSender().getFullName();
        return fullName == null || fullName.isBlank() ? original.getSender().getUsername() : fullName;
    }
}
