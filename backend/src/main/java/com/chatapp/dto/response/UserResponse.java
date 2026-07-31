package com.chatapp.dto.response;

import com.chatapp.model.User;

import java.time.LocalDateTime;

public record UserResponse(
        Long id,
        String username,
        String email,
        String avatar,
        Boolean online,
        LocalDateTime createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getAvatar(),
                user.getOnline(),
                user.getCreatedAt()
        );
    }
}
