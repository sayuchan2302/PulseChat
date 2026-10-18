package com.chatapp.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.net.URI;
import java.util.Set;

/**
 * CSRF defense-in-depth for the two auth endpoints that rely on a cookie in production
 * (SameSite=None): browsers must present an allowed Origin (or Referer). Non-browser clients
 * (curl, scripts) send neither header; they carry no ambient cookies for a third-party page
 * to abuse, so they are allowed through.
 */
@Component
@RequiredArgsConstructor
public class AuthOriginCheckFilter extends OncePerRequestFilter {
    private static final Set<String> PROTECTED_PATHS = Set.of("/auth/refresh", "/auth/logout");

    private final CorsConfigurationSource corsConfigurationSource;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod())
                || !PROTECTED_PATHS.contains(pathWithinContext(request));
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String origin = originOf(request);
        if (origin != null && !isAllowedOrigin(request, origin)) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "Origin is not allowed");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean isAllowedOrigin(HttpServletRequest request, String origin) {
        CorsConfiguration configuration = corsConfigurationSource.getCorsConfiguration(request);
        return configuration != null && configuration.checkOrigin(origin) != null;
    }

    private static String originOf(HttpServletRequest request) {
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (StringUtils.hasText(origin)) {
            return origin;
        }
        String referer = request.getHeader(HttpHeaders.REFERER);
        if (StringUtils.hasText(referer)) {
            return extractOrigin(referer);
        }
        return null;
    }

    static String extractOrigin(String referer) {
        try {
            URI uri = URI.create(referer);
            if (uri.getScheme() == null || uri.getAuthority() == null) {
                return null;
            }
            return uri.getScheme() + "://" + uri.getAuthority();
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static String pathWithinContext(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        String contextPath = request.getContextPath();
        return requestUri.startsWith(contextPath) ? requestUri.substring(contextPath.length()) : requestUri;
    }
}
