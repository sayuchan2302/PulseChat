package com.chatapp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {
    private static final String JWT_SECRET = "test-secret-for-jwt-signing-key-with-256-bits-minimum!";
    private static final long ACCESS_TOKEN_LIFETIME_MS = Duration.ofMinutes(15).toMillis();
    private static final long MEDIA_TOKEN_LIFETIME_MS = Duration.ofHours(24).toMillis();

    private static JwtService jwtService() {
        JwtService jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "jwtSecret", JWT_SECRET);
        ReflectionTestUtils.setField(jwtService, "jwtAccessExpirationMs", ACCESS_TOKEN_LIFETIME_MS);
        ReflectionTestUtils.setField(jwtService, "jwtMediaExpirationMs", MEDIA_TOKEN_LIFETIME_MS);
        return jwtService;
    }

    private static Claims claimsOf(String token) {
        return Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8)))
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    @Test
    void generatedAccessTokenExpiresAfterFifteenMinutesAndIsScopedToAccessUse() {
        JwtService jwtService = jwtService();

        String token = jwtService.generateAccessToken("sayu");
        Claims claims = claimsOf(token);

        assertEquals(ACCESS_TOKEN_LIFETIME_MS, claims.getExpiration().getTime() - claims.getIssuedAt().getTime());
        assertEquals("sayu", claims.getSubject());
        assertEquals("access", claims.get("token_use", String.class));
        assertEquals("sayu", jwtService.extractUsername(token));
    }

    @Test
    void generatedMediaTokenIsScopedToMediaUseAndExpiresAfterADay() {
        JwtService jwtService = jwtService();

        String token = jwtService.generateMediaToken("sayu");
        Claims claims = claimsOf(token);

        assertEquals(MEDIA_TOKEN_LIFETIME_MS, claims.getExpiration().getTime() - claims.getIssuedAt().getTime());
        assertEquals("media", claims.get("token_use", String.class));
        assertEquals("sayu", jwtService.extractMediaUsername(token));
    }

    @Test
    void mediaTokenCannotBeUsedAsAnAccessToken() {
        JwtService jwtService = jwtService();

        String mediaToken = jwtService.generateMediaToken("sayu");

        assertThrows(IllegalArgumentException.class, () -> jwtService.extractUsername(mediaToken));
    }

    @Test
    void accessTokenCannotBeUsedAsAMediaToken() {
        JwtService jwtService = jwtService();

        String accessToken = jwtService.generateAccessToken("sayu");

        assertThrows(IllegalArgumentException.class, () -> jwtService.extractMediaUsername(accessToken));
    }

    @Test
    void validSecretPassesStartupValidation() {
        JwtService jwtService = jwtService();

        assertDoesNotThrow(jwtService::validateConfiguration);
    }

    @Test
    void placeholderSecretIsRejectedAtStartup() {
        JwtService jwtService = jwtService();
        ReflectionTestUtils.setField(jwtService, "jwtSecret", "change-this-to-a-secure-random-string-minimum-256-bits-required");

        assertThrows(IllegalStateException.class, jwtService::validateConfiguration);
    }

    @Test
    void shortSecretIsRejectedAtStartup() {
        JwtService jwtService = jwtService();
        ReflectionTestUtils.setField(jwtService, "jwtSecret", "short-secret");

        IllegalStateException exception = assertThrows(IllegalStateException.class, jwtService::validateConfiguration);

        assertTrue(exception.getMessage().contains("32 bytes"));
    }
}
