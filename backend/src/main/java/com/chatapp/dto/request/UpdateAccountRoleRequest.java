package com.chatapp.dto.request;

import com.chatapp.model.AccountRole;
import jakarta.validation.constraints.NotNull;

public record UpdateAccountRoleRequest(
        @NotNull AccountRole accountRole
) {
}
