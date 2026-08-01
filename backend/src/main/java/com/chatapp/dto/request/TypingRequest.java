package com.chatapp.dto.request;

import jakarta.validation.constraints.NotNull;

public record TypingRequest(
        @NotNull Long receiverId,
        boolean typing
) {
}
