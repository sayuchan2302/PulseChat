package com.chatapp.dto.response;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.User;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

public record ChatRoomResponse(
        Long id,
        String name,
        String type,
        List<UserResponse> participants,
        LocalDateTime createdAt
) {
    public static ChatRoomResponse from(ChatRoom room) {
        return new ChatRoomResponse(
                room.getId(),
                room.getName(),
                room.getType().name().toLowerCase(),
                room.getParticipants()
                        .stream()
                        .sorted(Comparator.comparing(User::getUsername))
                        .map(UserResponse::from)
                        .toList(),
                room.getCreatedAt()
        );
    }
}
