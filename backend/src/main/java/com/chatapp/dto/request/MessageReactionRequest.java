package com.chatapp.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MessageReactionRequest(
        @NotBlank
        @Size(max = 32)
        String emoji
) {
}
