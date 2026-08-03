package com.chatapp.dto.response;

public record CloudinaryUploadSignatureResponse(
        String cloudName,
        String apiKey,
        long timestamp,
        String signature,
        String folder,
        String resourceType,
        String uploadUrl
) {
}
