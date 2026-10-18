package com.chatapp.service;

import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.RefreshToken;
import com.chatapp.model.User;
import com.chatapp.repository.RefreshTokenRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;

@Slf4j
@Service
public class RefreshTokenService {
    private static final int TOKEN_BYTES = 48;

    private final RefreshTokenRepository refreshTokenRepository;
    private final TransactionTemplate familyRevocationTemplate;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${jwt.refresh-expiration}")
    private long refreshExpirationMs;

    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository,
                               PlatformTransactionManager transactionManager) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.familyRevocationTemplate = new TransactionTemplate(transactionManager);
        this.familyRevocationTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional
    public String createToken(User user) {
        String rawToken = generateRawToken();

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUser(user);
        refreshToken.setTokenHash(hashToken(rawToken));
        refreshToken.setExpiresAt(LocalDateTime.now().plus(refreshExpirationMs, ChronoUnit.MILLIS));

        refreshTokenRepository.save(refreshToken);
        return rawToken;
    }

    @Transactional
    public RefreshToken consumeToken(String rawToken) {
        RefreshToken refreshToken = refreshTokenRepository.findByTokenHashForUpdate(hashToken(rawToken))
                .orElseThrow(() -> new AppException(ErrorCode.INVALID_REFRESH_TOKEN));

        if (refreshToken.getRevokedAt() != null) {
            // Presenting an already rotated token means it leaked (or was stolen): kill every active session.
            User user = refreshToken.getUser();
            String username = user.getUsername();
            int revoked = revokeAllSessions(user.getId());
            log.warn("Refresh token replay detected for user {}: revoked {} active session token(s)", username, revoked);
            throw new AppException(ErrorCode.INVALID_REFRESH_TOKEN);
        }

        if (!refreshToken.getExpiresAt().isAfter(LocalDateTime.now())) {
            revoke(refreshToken);
            throw new AppException(ErrorCode.INVALID_REFRESH_TOKEN);
        }

        if (!Boolean.TRUE.equals(refreshToken.getUser().getEnabled())) {
            revoke(refreshToken);
            throw new AppException(ErrorCode.INVALID_REFRESH_TOKEN);
        }

        revoke(refreshToken);
        return refreshToken;
    }

    @Transactional
    public void revokeToken(String rawToken) {
        refreshTokenRepository.findByTokenHash(hashToken(rawToken))
                .ifPresent(this::revoke);
    }

    private int revokeAllSessions(Long userId) {
        // Runs in its own transaction so the revocation survives the rollback of the failed refresh call.
        Integer revoked = familyRevocationTemplate.execute(status -> refreshTokenRepository.revokeAllActiveByUserId(userId));
        return revoked == null ? 0 : revoked;
    }

    private void revoke(RefreshToken refreshToken) {
        if (refreshToken.getRevokedAt() == null) {
            refreshToken.setRevokedAt(LocalDateTime.now());
        }
    }

    private String generateRawToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
}
