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
        return of(friendship, friendship.getStatus().name().toLowerCase());
    }

    /**
     * Emitted when an accepted friendship is removed. Clients treat it as a silent
     * state refresh, so unlike PENDING/ACCEPTED events it triggers no notification.
     */
    public static FriendshipResponse removed(Friendship friendship) {
        return of(friendship, "removed");
    }

    private static FriendshipResponse of(Friendship friendship, String status) {
        return new FriendshipResponse(
                friendship.getId(),
                UserResponse.from(friendship.getRequester()),
                UserResponse.from(friendship.getReceiver()),
                status,
                friendship.getCreatedAt(),
                friendship.getUpdatedAt()
        );
    }
}
