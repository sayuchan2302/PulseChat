package com.chatapp.dto.response;

import com.chatapp.model.ConversationSetting;

import java.time.LocalDateTime;

public record ConversationSettingResponse(
        Long id,
        Long userId,
        Long targetUserId,
        Long chatRoomId,
        Boolean pinned,
        Boolean muted,
        Boolean archived,
        LocalDateTime clearedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static ConversationSettingResponse from(ConversationSetting setting) {
        return new ConversationSettingResponse(
                setting.getId(),
                setting.getUser().getId(),
                setting.getTargetUser() == null ? null : setting.getTargetUser().getId(),
                setting.getChatRoom() == null ? null : setting.getChatRoom().getId(),
                Boolean.TRUE.equals(setting.getPinned()),
                Boolean.TRUE.equals(setting.getMuted()),
                Boolean.TRUE.equals(setting.getArchived()),
                setting.getClearedAt(),
                setting.getCreatedAt(),
                setting.getUpdatedAt()
        );
    }
}
