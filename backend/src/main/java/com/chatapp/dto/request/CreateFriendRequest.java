package com.chatapp.dto.request;

import jakarta.validation.constraints.NotNull;

public record CreateFriendRequest(
        @NotNull Long receiverId
) {
}
