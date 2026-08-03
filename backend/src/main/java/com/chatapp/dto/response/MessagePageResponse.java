package com.chatapp.dto.response;

import java.util.List;

public record MessagePageResponse(
        List<MessageResponse> items,
        boolean hasMore,
        Long nextBefore
) {
}
