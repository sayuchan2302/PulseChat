package com.chatapp.dto.request;

import jakarta.validation.constraints.NotNull;

public record ForwardMessageRequest(
        @NotNull Long messageId,
        Long targetUserId,
        Long targetRoomId) {
}
