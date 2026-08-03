package com.chatapp.dto.response;

import com.chatapp.model.Message;
import org.springframework.util.StringUtils;

public record LinkPreviewResponse(
        String url,
        String title,
        String description,
        String imageUrl,
        String domain
) {
    public static LinkPreviewResponse from(Message message) {
        if (!StringUtils.hasText(message.getLinkPreviewUrl())) {
            return null;
        }

        return new LinkPreviewResponse(
                message.getLinkPreviewUrl(),
                message.getLinkPreviewTitle(),
                message.getLinkPreviewDescription(),
                message.getLinkPreviewImageUrl(),
                message.getLinkPreviewDomain()
        );
    }
}
