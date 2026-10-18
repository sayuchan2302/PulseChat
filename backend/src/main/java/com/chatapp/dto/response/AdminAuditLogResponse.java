package com.chatapp.dto.response;

import com.chatapp.model.AdminAuditLog;

import java.time.LocalDateTime;

public record AdminAuditLogResponse(
        Long id,
        String actorUsername,
        String targetUsername,
        String action,
        String previousValue,
        String newValue,
        LocalDateTime createdAt
) {
    public static AdminAuditLogResponse from(AdminAuditLog auditLog) {
        return new AdminAuditLogResponse(
                auditLog.getId(),
                auditLog.getActor().getUsername(),
                auditLog.getTarget().getUsername(),
                auditLog.getAction().name(),
                auditLog.getPreviousValue(),
                auditLog.getNewValue(),
                auditLog.getCreatedAt()
        );
    }
}
