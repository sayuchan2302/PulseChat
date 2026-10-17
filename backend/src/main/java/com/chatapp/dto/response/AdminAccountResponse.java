package com.chatapp.dto.response;

import com.chatapp.model.User;

import java.time.LocalDateTime;

public record AdminAccountResponse(
        Long id,
        String username,
        String fullName,
        String email,
        String accountRole,
        boolean enabled,
        boolean online,
        LocalDateTime createdAt
) {
    public static AdminAccountResponse from(User user) {
        return new AdminAccountResponse(
                user.getId(),
                user.getUsername(),
                user.getFullName(),
                user.getEmail(),
                user.getAccountRole().name(),
                Boolean.TRUE.equals(user.getEnabled()),
                Boolean.TRUE.equals(user.getOnline()),
                user.getCreatedAt()
        );
    }
}
