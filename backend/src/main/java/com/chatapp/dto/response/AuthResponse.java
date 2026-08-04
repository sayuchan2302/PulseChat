package com.chatapp.dto.response;

public record AuthResponse(
        String token,
        String refreshToken,
        UserResponse user
) {
}
