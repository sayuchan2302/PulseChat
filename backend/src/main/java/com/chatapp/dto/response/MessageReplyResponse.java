package com.chatapp.dto.response;

import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import com.chatapp.util.MessagePreviewFormatter;

public record MessageReplyResponse(
        Long id,
        String content,
        MessageType type,
        Long senderId,
        String senderName,
        Boolean recalled
) {
    public static MessageReplyResponse from(Message message) {
        if (message == null) {
            return null;
        }

        return new MessageReplyResponse(
                message.getId(),
                MessagePreviewFormatter.previewContent(message),
                message.getType() == null ? MessageType.TEXT : message.getType(),
                message.getSender().getId(),
                displayName(message),
                Boolean.TRUE.equals(message.getRecalled())
        );
    }

    private static String displayName(Message message) {
        if (message.getChatRoom() != null) {
            String nickname = message.getChatRoom()
                    .getMembers()
                    .stream()
                    .filter(member -> member.getUser().getId().equals(message.getSender().getId()))
                    .map(ChatRoomMember::getNickname)
                    .filter(value -> value != null && !value.isBlank())
                    .findFirst()
                    .orElse(null);
            if (nickname != null) {
                return nickname;
            }
        }

        String fullName = message.getSender().getFullName();
        return fullName == null || fullName.isBlank() ? message.getSender().getUsername() : fullName;
    }
}
