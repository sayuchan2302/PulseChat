package com.chatapp.dto.request;

import jakarta.validation.constraints.NotNull;

public record TransferRoomOwnerRequest(
        @NotNull Long ownerId
) {
}
