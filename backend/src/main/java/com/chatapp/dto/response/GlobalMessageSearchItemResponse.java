package com.chatapp.dto.response;

public record GlobalMessageSearchItemResponse(
        MessageResponse message,
        String conversationName,
        Long otherUserId,
        String otherUsername,
        Long roomId) {
}
