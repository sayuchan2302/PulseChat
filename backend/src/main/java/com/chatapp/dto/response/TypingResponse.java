package com.chatapp.dto.response;

public record TypingResponse(
        Long senderId,
        String username,
        boolean typing
) {
}
