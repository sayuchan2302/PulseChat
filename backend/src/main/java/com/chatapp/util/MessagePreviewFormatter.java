package com.chatapp.util;

import com.chatapp.model.Message;
import com.chatapp.model.Message.MessageType;
import org.springframework.util.StringUtils;

public final class MessagePreviewFormatter {
    private MessagePreviewFormatter() {
    }

    public static String previewContent(Message message) {
        if (message == null) {
            return null;
        }

        if (Boolean.TRUE.equals(message.getRecalled())) {
            return "Message recalled";
        }

        if (StringUtils.hasText(message.getContent())) {
            return message.getContent();
        }

        MessageType type = message.getType() == null ? MessageType.TEXT : message.getType();
        return switch (type) {
            case IMAGE -> "Photo";
            case VIDEO -> "Video";
            case TEXT -> message.getContent();
        };
    }
}
