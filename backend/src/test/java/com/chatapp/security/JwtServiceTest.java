package com.chatapp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JwtServiceTest {
    private static final String JWT_SECRET = "test-secret-for-jwt-signing-key-with-256-bits-minimum!";
    private static final long ACCESS_TOKEN_LIFETIME_MS = Duration.ofMinutes(15).toMillis();

    @Test
    void generatedAccessTokenExpiresAfterFifteenMinutes() {
        JwtService jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "jwtSecret", JWT_SECRET);
        ReflectionTestUtils.setField(jwtService, "jwtAccessExpirationMs", ACCESS_TOKEN_LIFETIME_MS);

        String token = jwtService.generateAccessToken("sayu");
        Claims claims = Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8)))
                .build()
                .parseSignedClaims(token)
                .getPayload();

        assertEquals(ACCESS_TOKEN_LIFETIME_MS, claims.getExpiration().getTime() - claims.getIssuedAt().getTime());
        assertEquals("sayu", claims.getSubject());
    }
}
