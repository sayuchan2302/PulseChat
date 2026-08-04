package com.chatapp.dto.request;

public record UpdateConversationSettingRequest(
        Boolean pinned,
        Boolean muted,
        Boolean archived
) {
}
