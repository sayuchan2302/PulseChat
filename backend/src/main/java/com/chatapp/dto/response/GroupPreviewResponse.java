package com.chatapp.dto.response;

public record GroupPreviewResponse(
        Long roomId,
        String name,
        String avatar,
        long memberCount,
        String ownerUsername,
        String ownerFullName) {
}
