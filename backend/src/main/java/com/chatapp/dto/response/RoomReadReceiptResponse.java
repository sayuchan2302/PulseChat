package com.chatapp.dto.response;

import java.time.LocalDateTime;

public record RoomReadReceiptResponse(
        Long roomId,
        Long readerId,
        LocalDateTime readAt
) {
}
