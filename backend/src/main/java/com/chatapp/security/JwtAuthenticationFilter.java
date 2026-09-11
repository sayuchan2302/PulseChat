package com.chatapp.security;

import io.jsonwebtoken.JwtException;
import com.chatapp.exception.AppException;
import com.chatapp.service.RefreshTokenService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;
    private final MediaSessionCookieService mediaSessionCookieService;
    private final RefreshTokenService refreshTokenService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            try {
                mediaSessionCookieService.readSession(request).ifPresent(token ->
                        authenticateUsername(request, refreshTokenService.getActiveUsername(token)));
            } catch (AppException ignored) {
                SecurityContextHolder.clearContext();
            }
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        try {
            authenticateRequest(request, token);
        } catch (JwtException | IllegalArgumentException ignored) {
            SecurityContextHolder.clearContext();
        }

        filterChain.doFilter(request, response);
    }

    private void authenticateRequest(HttpServletRequest request, String token) {
        String username = jwtService.extractUsername(token);
        if (username == null || SecurityContextHolder.getContext().getAuthentication() != null) {
            return;
        }

        UserDetails userDetails = userDetailsService.loadUserByUsername(username);
        if (!jwtService.isTokenValid(token, userDetails)) {
            return;
        }

        setAuthentication(request, userDetails);
    }

    private void authenticateUsername(HttpServletRequest request, String username) {
        if (SecurityContextHolder.getContext().getAuthentication() != null) return;
        UserDetails userDetails = userDetailsService.loadUserByUsername(username);
        setAuthentication(request, userDetails);
    }

    private void setAuthentication(HttpServletRequest request, UserDetails userDetails) {
        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(
                userDetails,
                null,
                userDetails.getAuthorities()
        );
        authenticationToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authenticationToken);
    }
}
