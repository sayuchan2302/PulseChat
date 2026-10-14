package com.chatapp.dto.response;

import java.util.List;

public record GlobalMessageSearchPageResponse(
        List<GlobalMessageSearchItemResponse> items,
        boolean hasMore,
        Long nextBefore) {
}
