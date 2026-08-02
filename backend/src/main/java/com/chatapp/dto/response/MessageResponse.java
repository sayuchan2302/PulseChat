package com.chatapp.dto.response;

import com.chatapp.model.Message;

import java.time.LocalDateTime;

public record MessageResponse(
        Long id,
        String content,
        Long senderId,
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
                message.getSender().getId(),
                message.getReceiver() == null ? null : message.getReceiver().getId(),
                message.getChatRoom() == null ? null : message.getChatRoom().getId(),
                message.getRead(),
                message.getTimestamp(),
                message.getClientId()
        );
    }
}
