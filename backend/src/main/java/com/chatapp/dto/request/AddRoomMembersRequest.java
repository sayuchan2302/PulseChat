package com.chatapp.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.Set;

public record AddRoomMembersRequest(
        @NotEmpty
        Set<@NotNull Long> participantIds
) {
}
