package com.chatapp.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record CreateChatRoomRequest(
        @NotBlank @Size(min = 2, max = 100) String name,
        @NotEmpty Set<@NotNull Long> participantIds
) {
}
