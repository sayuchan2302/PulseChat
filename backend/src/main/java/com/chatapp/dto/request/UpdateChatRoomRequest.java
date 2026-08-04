package com.chatapp.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateChatRoomRequest(
        @NotBlank
        @Size(min = 2, max = 100)
        String name
) {
}
