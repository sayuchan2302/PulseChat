package com.chatapp.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Arrays;
import java.util.Optional;

/** A revocable session cookie accepted only for reading local media. */
@Component
public class MediaSessionCookieService {
    private static final String NAME = "chat_media_session";
    private final String path;
    private final boolean secure;
    private final String sameSite;
    private final Duration maxAge;

    public MediaSessionCookieService(
            @Value("${server.servlet.context-path:}") String contextPath,
            @Value("${auth.refresh-cookie.secure:false}") boolean secure,
            @Value("${auth.refresh-cookie.same-site:Lax}") String sameSite,
            @Value("${jwt.refresh-expiration}") long expirationMs) {
        this.path = contextPath.replaceAll("/+$", "") + "/uploads/media";
        this.secure = secure;
        this.sameSite = sameSite;
        this.maxAge = Duration.ofMillis(expirationMs);
    }

    public void addSession(HttpServletResponse response, String refreshToken) {
        write(response, refreshToken, maxAge);
    }

    public void clearSession(HttpServletResponse response) {
        write(response, "", Duration.ZERO);
    }

    public Optional<String> readSession(HttpServletRequest request) {
        String requestPath = request.getRequestURI().substring(request.getContextPath().length());
        if (!("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod()))
                || !requestPath.startsWith("/uploads/media/") || request.getCookies() == null) {
            return Optional.empty();
        }
        return Arrays.stream(request.getCookies())
                .filter(cookie -> NAME.equals(cookie.getName()))
                .map(jakarta.servlet.http.Cookie::getValue)
                .filter(value -> value != null && !value.isBlank())
                .findFirst();
    }

    private void write(HttpServletResponse response, String value, Duration age) {
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(NAME, value)
                .httpOnly(true).secure(secure).sameSite(sameSite).path(path).maxAge(age).build().toString());
    }
}
