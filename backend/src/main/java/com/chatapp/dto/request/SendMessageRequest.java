package com.chatapp.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SendMessageRequest(
        @NotNull Long receiverId,
        @NotBlank @Size(max = 5000) String content
) {
}
