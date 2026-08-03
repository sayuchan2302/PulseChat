package com.chatapp.dto.response;

import com.chatapp.model.User;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(
        Long id,
        String username,
        String fullName,
        String email,
        String avatar,
        String bio,
        Boolean online,
        LocalDateTime lastSeenAt,
        LocalDateTime createdAt,
        String friendshipStatus,
        Long friendshipId,
        String lastMessageContent,
        LocalDateTime lastMessageAt,
        Long lastMessageSenderId
) {
    public static UserResponse from(User user) {
        return from(user, null, null, null, null, null);
    }

    public static UserResponse from(User user, String friendshipStatus) {
        return from(user, friendshipStatus, null, null, null, null);
    }

    public static UserResponse from(User user, String friendshipStatus, Long friendshipId) {
        return from(user, friendshipStatus, friendshipId, null, null, null);
    }

    public static UserResponse from(
            User user,
            String friendshipStatus,
            Long friendshipId,
            String lastMessageContent,
            LocalDateTime lastMessageAt,
            Long lastMessageSenderId
    ) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                displayName(user),
                user.getEmail(),
                user.getAvatar(),
                user.getBio(),
                user.getOnline(),
                user.getLastSeenAt(),
                user.getCreatedAt(),
                friendshipStatus,
                friendshipId,
                lastMessageContent,
                lastMessageAt,
                lastMessageSenderId
        );
    }

    private static String displayName(User user) {
        String fullName = user.getFullName();
        return fullName == null || fullName.isBlank() ? user.getUsername() : fullName;
    }
}
