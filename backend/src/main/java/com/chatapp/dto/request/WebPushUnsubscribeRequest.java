package com.chatapp.dto.request;

import jakarta.validation.constraints.NotBlank;

public record WebPushUnsubscribeRequest(
        @NotBlank String endpoint
) {}

