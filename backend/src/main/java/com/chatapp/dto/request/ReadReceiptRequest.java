package com.chatapp.dto.request;

import jakarta.validation.constraints.NotNull;

public record ReadReceiptRequest(
        @NotNull(message = "Sender id is required")
        Long senderId
) {
}
