package com.chatapp.dto.response;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.Message;
import com.chatapp.model.User;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

public record ChatRoomResponse(
        Long id,
        String name,
        String type,
        List<UserResponse> participants,
        LocalDateTime createdAt,
        String lastMessageContent,
        LocalDateTime lastMessageAt,
        Long lastMessageSenderId,
        String lastMessageSenderName,
        long unreadCount
) {
    public static ChatRoomResponse from(ChatRoom room) {
        return from(room, null, 0);
    }

    public static ChatRoomResponse from(ChatRoom room, Message lastMessage, long unreadCount) {
        return new ChatRoomResponse(
                room.getId(),
                room.getName(),
                room.getType().name().toLowerCase(),
                room.getParticipants()
                        .stream()
                        .sorted(Comparator.comparing(User::getUsername))
                        .map(UserResponse::from)
                        .toList(),
                room.getCreatedAt(),
                lastMessage == null ? null : lastMessage.getContent(),
                lastMessage == null ? null : lastMessage.getTimestamp(),
                lastMessage == null ? null : lastMessage.getSender().getId(),
                lastMessage == null ? null : displayName(lastMessage.getSender()),
                unreadCount
        );
    }

    private static String displayName(User user) {
        String fullName = user.getFullName();
        return fullName == null || fullName.isBlank() ? user.getUsername() : fullName;
    }
}
