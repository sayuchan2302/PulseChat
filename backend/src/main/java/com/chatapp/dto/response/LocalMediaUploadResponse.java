package com.chatapp.dto.response;

public record LocalMediaUploadResponse(
        String url,
        String publicId,
        String resourceType,
        String format,
        long bytes) {
}
