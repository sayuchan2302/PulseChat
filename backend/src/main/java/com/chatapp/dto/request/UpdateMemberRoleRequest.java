package com.chatapp.dto.request;

import com.chatapp.model.ChatRoomMember;
import jakarta.validation.constraints.NotNull;

public record UpdateMemberRoleRequest(
        @NotNull ChatRoomMember.Role role) {
}
