package com.chatapp.dto.response;

import com.chatapp.model.Friendship;

import java.time.LocalDateTime;

public record FriendshipResponse(
        Long id,
        UserResponse requester,
        UserResponse receiver,
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static FriendshipResponse from(Friendship friendship) {
        return new FriendshipResponse(
                friendship.getId(),
                UserResponse.from(friendship.getRequester()),
                UserResponse.from(friendship.getReceiver()),
                friendship.getStatus().name().toLowerCase(),
                friendship.getCreatedAt(),
                friendship.getUpdatedAt()
        );
    }
}
