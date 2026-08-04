package com.chatapp.dto.response;

import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.User;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(
        Long id,
        String username,
        String fullName,
        String nickname,
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
        Long lastMessageSenderId,
        Boolean pinned,
        Boolean muted,
        Boolean archived
) {
    public static UserResponse from(User user) {
        return from(user, null, null, null, null, null, null, null);
    }

    public static UserResponse from(User user, String friendshipStatus) {
        return from(user, friendshipStatus, null, null, null, null, null, null);
    }

    public static UserResponse from(User user, String friendshipStatus, Long friendshipId) {
        return from(user, friendshipStatus, friendshipId, null, null, null, null, null);
    }

    public static UserResponse from(ChatRoomMember member) {
        return from(member.getUser(), null, null, null, null, null, normalizeNickname(member.getNickname()), null);
    }

    public static UserResponse from(
            User user,
            String friendshipStatus,
            Long friendshipId,
            String lastMessageContent,
            LocalDateTime lastMessageAt,
            Long lastMessageSenderId
    ) {
        return from(user, friendshipStatus, friendshipId, lastMessageContent, lastMessageAt, lastMessageSenderId, null, null);
    }

    public static UserResponse from(
            User user,
            String friendshipStatus,
            Long friendshipId,
            String lastMessageContent,
            LocalDateTime lastMessageAt,
            Long lastMessageSenderId,
            ConversationSetting setting
    ) {
        return from(user, friendshipStatus, friendshipId, lastMessageContent, lastMessageAt, lastMessageSenderId, null, setting);
    }

    public static UserResponse from(
            User user,
            String friendshipStatus,
            Long friendshipId,
            String lastMessageContent,
            LocalDateTime lastMessageAt,
            Long lastMessageSenderId,
            String nickname,
            ConversationSetting setting
    ) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                displayName(user),
                nickname,
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
                lastMessageSenderId,
                isEnabled(setting == null ? null : setting.getPinned()),
                isEnabled(setting == null ? null : setting.getMuted()),
                isEnabled(setting == null ? null : setting.getArchived())
        );
    }

    private static String normalizeNickname(String nickname) {
        return nickname == null || nickname.isBlank() ? null : nickname.trim();
    }

    private static String displayName(User user) {
        String fullName = user.getFullName();
        return fullName == null || fullName.isBlank() ? user.getUsername() : fullName;
    }

    private static boolean isEnabled(Boolean value) {
        return Boolean.TRUE.equals(value);
    }
}
