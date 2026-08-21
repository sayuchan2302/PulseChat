package com.chatapp.dto.response;

public record AuthResponse(
        String token,
        UserResponse user
) {
}
