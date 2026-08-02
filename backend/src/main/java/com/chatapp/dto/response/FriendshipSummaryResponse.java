package com.chatapp.dto.response;

public record FriendshipSummaryResponse(
        long incomingCount,
        long outgoingCount
) {
}
