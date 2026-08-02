package com.chatapp.dto.response;

import com.chatapp.model.User;

import java.time.LocalDateTime;

public record UserResponse(
        Long id,
        String username,
        String fullName,
        String email,
        String avatar,
        Boolean online,
        LocalDateTime createdAt
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                displayName(user),
                user.getEmail(),
                user.getAvatar(),
                user.getOnline(),
                user.getCreatedAt()
        );
    }

    private static String displayName(User user) {
        String fullName = user.getFullName();
        return fullName == null || fullName.isBlank() ? user.getUsername() : fullName;
    }
}
