package com.chatapp.dto.response;

import org.springframework.data.domain.Page;

import java.util.List;

public record AdminAuditLogPageResponse(
        List<AdminAuditLogResponse> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public static AdminAuditLogPageResponse from(Page<AdminAuditLogResponse> page) {
        return new AdminAuditLogPageResponse(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }
}
