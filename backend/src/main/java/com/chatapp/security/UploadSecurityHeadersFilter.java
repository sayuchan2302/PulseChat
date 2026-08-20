package com.chatapp.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Locale;
import java.util.Set;

@Component
public class UploadSecurityHeadersFilter extends OncePerRequestFilter {
    private static final Set<String> INLINE_MEDIA_EXTENSIONS = Set.of(
            "jpg", "jpeg", "png", "gif", "webp",
            "mp4", "webm", "mov", "avi", "mkv",
            "mp3", "ogg", "wav"
    );

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String requestPath = request.getRequestURI();
        if (requestPath.contains("/uploads/")) {
            response.setHeader("X-Content-Type-Options", "nosniff");
            if (requestPath.contains("/uploads/media/") && !hasInlineMediaExtension(requestPath)) {
                response.setHeader("Content-Disposition", "attachment");
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean hasInlineMediaExtension(String requestPath) {
        int extensionStart = requestPath.lastIndexOf('.') + 1;
        return extensionStart > 0 && INLINE_MEDIA_EXTENSIONS.contains(
                requestPath.substring(extensionStart).toLowerCase(Locale.ROOT)
        );
    }
}
