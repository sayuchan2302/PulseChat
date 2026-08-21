package com.chatapp.dto.response;

import java.time.LocalDateTime;

public record RoomSummaryResponse(
        Long roomId,
        Long fromMessageId,
        Long toMessageId,
        int messageCount,
        String summary,
        LocalDateTime generatedAt
) {
}
