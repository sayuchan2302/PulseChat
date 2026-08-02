package com.chatapp.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendRoomMessageRequest(
        @NotBlank @Size(max = 5000) String content,
        @Size(max = 100) String clientId
) {
}
