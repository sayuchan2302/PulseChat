package com.chatapp.service;

public record LinkPreviewMetadata(
        String url,
        String title,
        String description,
        String imageUrl,
        String domain
) {
}
