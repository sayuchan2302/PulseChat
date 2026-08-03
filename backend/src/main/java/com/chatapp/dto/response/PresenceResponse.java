package com.chatapp.dto.response;

import java.time.LocalDateTime;

public record PresenceResponse(
        Long userId,
        String username,
        boolean online,
        LocalDateTime lastSeenAt
) {
}
