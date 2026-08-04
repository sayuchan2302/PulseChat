package com.chatapp.dto.request;

import jakarta.validation.constraints.Size;

public record UpdateRoomMemberNicknameRequest(
        @Size(max = 80)
        String nickname
) {
}
