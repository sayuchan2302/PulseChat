package com.chatapp.dto.request;

import jakarta.validation.constraints.NotBlank;

public record WebPushSubscriptionRequest(
        @NotBlank String endpoint,
        @NotBlank String p256dh,
        @NotBlank String auth,
        String userAgent
) {}

