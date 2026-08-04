package com.chatapp.dto.response;

public record TypingResponse(
        Long senderId,
        String username,
        Long roomId,
        boolean typing
) {
}
