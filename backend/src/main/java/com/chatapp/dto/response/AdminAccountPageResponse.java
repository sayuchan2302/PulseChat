package com.chatapp.dto.response;

import org.springframework.data.domain.Page;

import java.util.List;

public record AdminAccountPageResponse(
        List<AdminAccountResponse> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public static AdminAccountPageResponse from(Page<AdminAccountResponse> page) {
        return new AdminAccountPageResponse(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }
}
