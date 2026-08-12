package com.chatapp.dto.response;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.ConversationSetting;
import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.util.MessagePreviewFormatter;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;

public record ChatRoomResponse(
        Long id,
        String name,
        String type,
        List<UserResponse> participants,
        Long ownerId,
        String ownerUsername,
        String ownerFullName,
        LocalDateTime createdAt,
        String lastMessageContent,
        LocalDateTime lastMessageAt,
        Long lastMessageSenderId,
        String lastMessageSenderName,
        long unreadCount,
        Boolean pinned,
        Boolean muted,
        Boolean archived,
        Long pinnedMessageId,
        MessageResponse pinnedMessage) {
    public static ChatRoomResponse from(ChatRoom room) {
        return from(room, null, 0);
    }

    public static ChatRoomResponse from(ChatRoom room, Message lastMessage, long unreadCount) {
        return from(room, lastMessage, unreadCount, null);
    }

    public static ChatRoomResponse from(
            ChatRoom room,
            Message lastMessage,
            long unreadCount,
            ConversationSetting setting) {
        User owner = findEffectiveOwner(room);
        return new ChatRoomResponse(
                room.getId(),
                room.getName(),
                room.getType().name().toLowerCase(),
                room.getMembers()
                        .stream()
                        .sorted(Comparator.comparing(member -> member.getUser().getUsername()))
                        .map(UserResponse::from)
                        .toList(),
                owner == null ? null : owner.getId(),
                owner == null ? null : owner.getUsername(),
                owner == null ? null : owner.getFullName(),
                room.getCreatedAt(),
                MessagePreviewFormatter.previewContent(lastMessage),
                lastMessage == null ? null : lastMessage.getTimestamp(),
                lastMessage == null ? null : lastMessage.getSender().getId(),
                lastMessage == null ? null : displayName(lastMessage.getSender(), room),
                unreadCount,
                isEnabled(setting == null ? null : setting.getPinned()),
                isEnabled(setting == null ? null : setting.getMuted()),
                isEnabled(setting == null ? null : setting.getArchived()),
                room.getPinnedMessage() == null ? null : room.getPinnedMessage().getId(),
                room.getPinnedMessage() == null ? null : MessageResponse.from(room.getPinnedMessage()));
    }

    private static User findEffectiveOwner(ChatRoom room) {
        if (room.getOwner() != null) {
            return room.getOwner();
        }

        return room.getMembers()
                .stream()
                .map(ChatRoomMember::getUser)
                .min(Comparator.comparing(User::getId))
                .orElse(null);
    }

    private static String displayName(User user, ChatRoom room) {
        String nickname = room.getMembers()
                .stream()
                .filter(member -> member.getUser().getId().equals(user.getId()))
                .map(ChatRoomMember::getNickname)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
        if (nickname != null) {
            return nickname;
        }

        String fullName = user.getFullName();
        return fullName == null || fullName.isBlank() ? user.getUsername() : fullName;
    }

    private static boolean isEnabled(Boolean value) {
        return Boolean.TRUE.equals(value);
    }
}
