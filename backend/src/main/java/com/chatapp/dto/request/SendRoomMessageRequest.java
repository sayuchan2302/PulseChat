package com.chatapp.dto.request;

import com.chatapp.model.Message.MessageType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

public record SendRoomMessageRequest(
        @Size(max = 5000) String content,
        @Size(max = 100) String clientId,
        Long replyToMessageId,
        MessageType type,
        @Valid MediaAttachmentRequest media
) {
}
