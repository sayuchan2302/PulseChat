package com.chatapp.dto.response;

public record PresenceResponse(
        Long userId,
        String username,
        boolean online
) {
}
