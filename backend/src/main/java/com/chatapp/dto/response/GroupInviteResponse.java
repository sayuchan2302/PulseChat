package com.chatapp.dto.response;

public record GroupInviteResponse(
        Long roomId,
        String inviteCode,
        String inviteUrl,
        boolean enabled) {
}
