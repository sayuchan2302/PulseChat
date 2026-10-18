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
        String avatar,
        String inviteCode,
        Boolean inviteCodeEnabled,
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
    public static ChatRoomResponse from(
            ChatRoom room,
            Message lastMessage,
            long unreadCount,
            ConversationSetting setting,
            long currentUserId) {
        User owner = findEffectiveOwner(room);
        boolean viewerIsAdmin = isGroupAdmin(room, owner, currentUserId);
        Message pinnedMessage = room.getPinnedMessage();
        if (pinnedMessage != null && pinnedMessage.getHiddenByUsers().stream()
                .anyMatch(user -> user.getId().equals(currentUserId))) {
            pinnedMessage = null;
        }
        return new ChatRoomResponse(
                room.getId(),
                room.getName(),
                room.getAvatar(),
                viewerIsAdmin ? room.getInviteCode() : null,
                viewerIsAdmin ? room.getInviteCodeEnabled() : null,
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
                pinnedMessage == null ? null : pinnedMessage.getId(),
                pinnedMessage == null ? null : MessageResponse.from(pinnedMessage, currentUserId));
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

    /** The invite code is only disclosed to the group owner and moderators. */
    private static boolean isGroupAdmin(ChatRoom room, User effectiveOwner, long currentUserId) {
        if (effectiveOwner != null && effectiveOwner.getId().equals(currentUserId)) {
            return true;
        }

        return room.getMembers()
                .stream()
                .filter(member -> member.getUser().getId().equals(currentUserId))
                .map(ChatRoomMember::getRole)
                .anyMatch(role -> role == ChatRoomMember.Role.OWNER || role == ChatRoomMember.Role.MODERATOR);
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
