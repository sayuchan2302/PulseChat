package com.chatapp.controller;

import com.chatapp.dto.request.LoginRequest;
import com.chatapp.dto.request.RegisterRequest;
import com.chatapp.dto.response.AuthResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.service.AuthService;
import com.chatapp.security.RefreshTokenCookieService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;
    private final RefreshTokenCookieService refreshTokenCookieService;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletResponse response
    ) {
        return withRefreshCookie(authService.register(request), response, HttpStatus.CREATED);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response
    ) {
        return withRefreshCookie(authService.login(request), response, HttpStatus.OK);
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(HttpServletRequest request, HttpServletResponse response) {
        try {
            AuthService.AuthResult result = refreshTokenCookieService.readRefreshToken(request)
                    .map(authService::refresh)
                    .orElseThrow(() -> new AppException(ErrorCode.INVALID_REFRESH_TOKEN));
            return withRefreshCookie(result, response, HttpStatus.OK);
        } catch (RuntimeException exception) {
            refreshTokenCookieService.clearRefreshToken(response);
            throw exception;
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        refreshTokenCookieService.readRefreshToken(request).ifPresent(authService::logout);
        refreshTokenCookieService.clearRefreshToken(response);
        return ResponseEntity.noContent().build();
    }

    private ResponseEntity<AuthResponse> withRefreshCookie(
            AuthService.AuthResult result,
            HttpServletResponse response,
            HttpStatus status
    ) {
        refreshTokenCookieService.addRefreshToken(response, result.refreshToken());
        return ResponseEntity.status(status).body(result.response());
    }
}
