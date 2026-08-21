package com.chatapp.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;

@Component
public class RefreshTokenCookieService {
    private final String cookieName;
    private final String cookiePath;
    private final boolean secure;
    private final String sameSite;
    private final Duration maxAge;

    public RefreshTokenCookieService(
            @Value("${auth.refresh-cookie.name:chat_refresh_token}") String cookieName,
            @Value("${auth.refresh-cookie.path:/api/auth}") String cookiePath,
            @Value("${auth.refresh-cookie.secure:false}") boolean secure,
            @Value("${auth.refresh-cookie.same-site:Lax}") String sameSite,
            @Value("${jwt.refresh-expiration}") long refreshExpirationMs
    ) {
        this.cookieName = cookieName;
        this.cookiePath = cookiePath;
        this.secure = secure;
        this.sameSite = sameSite;
        this.maxAge = Duration.ofMillis(refreshExpirationMs);
    }

    public void addRefreshToken(HttpServletResponse response, String refreshToken) {
        response.addHeader(HttpHeaders.SET_COOKIE, createCookie(refreshToken, maxAge).toString());
    }

    public void clearRefreshToken(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, createCookie("", Duration.ZERO).toString());
    }

    public Optional<String> readRefreshToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }

        return Arrays.stream(cookies)
                .filter(cookie -> cookieName.equals(cookie.getName()))
                .map(Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    private ResponseCookie createCookie(String value, Duration duration) {
        return ResponseCookie.from(cookieName, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite(sameSite)
                .path(cookiePath)
                .maxAge(duration)
                .build();
    }
}
