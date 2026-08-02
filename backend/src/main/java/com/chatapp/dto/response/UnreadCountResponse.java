package com.chatapp.dto.response;

public record UnreadCountResponse(
        Long userId,
        long unreadCount
) {
}
