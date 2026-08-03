package com.chatapp.dto.request;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record MediaAttachmentRequest(
        @Size(max = 2048) String url,
        @Size(max = 255) String publicId,
        @Size(max = 20) String resourceType,
        @Size(max = 20) String format,
        @Positive Long bytes,
        @Positive Integer width,
        @Positive Integer height,
        @PositiveOrZero Double duration
) {
}
