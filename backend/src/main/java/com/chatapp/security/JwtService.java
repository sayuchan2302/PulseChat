package com.chatapp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Locale;
import java.util.function.Function;

@Service
public class JwtService {
    static final String TOKEN_USE_CLAIM = "token_use";
    static final String TOKEN_USE_ACCESS = "access";
    static final String TOKEN_USE_MEDIA = "media";

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.access-expiration}")
    private long jwtAccessExpirationMs;

    @Value("${jwt.media-expiration:86400000}")
    private long jwtMediaExpirationMs;

    @PostConstruct
    void validateConfiguration() {
        if (!StringUtils.hasText(jwtSecret)) {
            throw new IllegalStateException("jwt.secret must be configured (JWT_SECRET environment variable)");
        }
        String normalized = jwtSecret.trim().toLowerCase(Locale.ROOT);
        if (normalized.contains("change-this") || normalized.contains("changeme")
                || normalized.contains("placeholder") || normalized.contains("your-secret")
                || normalized.contains("replace-me") || normalized.contains("dev-secret")) {
            throw new IllegalStateException("jwt.secret still uses the example/placeholder value; "
                    + "generate a real secret, e.g. `openssl rand -base64 48`");
        }
        int keyLength = effectiveKeyLengthBytes();
        if (keyLength < 32) {
            throw new IllegalStateException("jwt.secret must provide at least 32 bytes (256 bits); "
                    + "current effective length: " + keyLength + " bytes");
        }
    }

    private int effectiveKeyLengthBytes() {
        try {
            return Keys.hmacShaKeyFor(Decoders.BASE64.decode(jwtSecret)).getEncoded().length;
        } catch (RuntimeException ignored) {
            return jwtSecret.getBytes(StandardCharsets.UTF_8).length;
        }
    }

    public String generateAccessToken(String username) {
        return generateToken(username, TOKEN_USE_ACCESS, jwtAccessExpirationMs);
    }

    /** Media reads (img/video tags) cannot send an Authorization header, so this short-lived token is cookie-delivered. */
    public String generateMediaToken(String username) {
        return generateToken(username, TOKEN_USE_MEDIA, jwtMediaExpirationMs);
    }

    public String extractUsername(String token) {
        return extractUsernameWithPurpose(token, TOKEN_USE_ACCESS);
    }

    public String extractMediaUsername(String token) {
        return extractUsernameWithPurpose(token, TOKEN_USE_MEDIA);
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        String username = extractUsername(token);
        return userDetails.isEnabled()
                && username.equals(userDetails.getUsername())
                && !isTokenExpired(token);
    }

    private String generateToken(String username, String tokenUse, long expirationMs) {
        Date now = new Date();
        Date expiresAt = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
                .subject(username)
                .claim(TOKEN_USE_CLAIM, tokenUse)
                .issuedAt(now)
                .expiration(expiresAt)
                .signWith(getSigningKey())
                .compact();
    }

    private String extractUsernameWithPurpose(String token, String expectedUse) {
        Claims claims = extractClaims(token);
        if (!expectedUse.equals(claims.get(TOKEN_USE_CLAIM, String.class))) {
            throw new IllegalArgumentException("Unexpected JWT token use");
        }
        return claims.getSubject();
    }

    private boolean isTokenExpired(String token) {
        return extractClaim(token, Claims::getExpiration).before(new Date());
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver) {
        return resolver.apply(extractClaims(token));
    }

    private Claims extractClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSigningKey() {
        try {
            return Keys.hmacShaKeyFor(Decoders.BASE64.decode(jwtSecret));
        } catch (RuntimeException ignored) {
            return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        }
    }
}
