package com.chatapp.dto.request;

import jakarta.validation.constraints.NotNull;

public record UpdateAccountStatusRequest(
        @NotNull Boolean enabled
) {
}
