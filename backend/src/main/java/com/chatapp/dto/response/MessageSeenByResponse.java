package com.chatapp.dto.response;

import java.util.List;

public record MessageSeenByResponse(
        Long messageId,
        Long roomId,
        List<UserResponse> seenBy
) {
}
