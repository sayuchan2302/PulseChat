package com.chatapp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

    @Test
    void expiredAccessTokensAreRejected() {
        JwtService jwtService = jwtService();
        ReflectionTestUtils.setField(jwtService, "jwtAccessExpirationMs", -1_000L);

        String token = jwtService.generateAccessToken("sayu");

        assertThrows(ExpiredJwtException.class, () -> jwtService.extractUsername(token));
    }

    @Test
    void tamperedPayloadsAreRejected() {
        JwtService jwtService = jwtService();
        String[] parts = jwtService.generateAccessToken("sayu").split("\\.");
        char firstPayloadChar = parts[1].charAt(0);
        String tamperedPayload = (firstPayloadChar == 'A' ? 'B' : 'A') + parts[1].substring(1);
        String tampered = parts[0] + "." + tamperedPayload + "." + parts[2];

        assertThrows(JwtException.class, () -> jwtService.extractUsername(tampered));
    }

    @Test
    void malformedTokensAreRejected() {
        JwtService jwtService = jwtService();

        assertThrows(JwtException.class, () -> jwtService.extractUsername("not-a-jwt"));
    }

    @Test
    void tokensSignedWithAnotherSecretAreRejected() {
        JwtService issuer = jwtService();
        JwtService verifier = jwtService();
        ReflectionTestUtils.setField(verifier, "jwtSecret", "totally-different-signing-secret-with-more-than-32-bytes!");

        String token = issuer.generateAccessToken("sayu");

        assertThrows(JwtException.class, () -> verifier.extractUsername(token));
    }

    @Test
    void isTokenValidRejectsDisabledAccounts() {
        JwtService jwtService = jwtService();
        String token = jwtService.generateAccessToken("sayu");
        UserDetails disabled = User.withUsername("sayu").password("unused").roles("USER").disabled(true).build();

        assertFalse(jwtService.isTokenValid(token, disabled));
    }

    @Test
    void isTokenValidAcceptsAnEnabledMatchingAccount() {
        JwtService jwtService = jwtService();
        String token = jwtService.generateAccessToken("sayu");
        UserDetails enabled = User.withUsername("sayu").password("unused").roles("USER").build();

        assertTrue(jwtService.isTokenValid(token, enabled));
    }
}
