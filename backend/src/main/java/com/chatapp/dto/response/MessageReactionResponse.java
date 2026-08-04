package com.chatapp.dto.response;

import com.chatapp.model.MessageReaction;

import java.time.LocalDateTime;

public record MessageReactionResponse(
        Long id,
        String emoji,
        Long userId,
        String username,
        String fullName,
        LocalDateTime createdAt
) {
    public static MessageReactionResponse from(MessageReaction reaction) {
        return new MessageReactionResponse(
                reaction.getId(),
                reaction.getEmoji(),
                reaction.getUser().getId(),
                reaction.getUser().getUsername(),
                displayName(reaction),
                reaction.getCreatedAt()
        );
    }

    private static String displayName(MessageReaction reaction) {
        String fullName = reaction.getUser().getFullName();
        return fullName == null || fullName.isBlank() ? reaction.getUser().getUsername() : fullName;
    }
}
