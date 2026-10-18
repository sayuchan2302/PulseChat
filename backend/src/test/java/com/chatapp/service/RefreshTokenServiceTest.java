package com.chatapp.service;

import com.chatapp.exception.AppException;
import com.chatapp.model.RefreshToken;
import com.chatapp.model.User;
import com.chatapp.repository.RefreshTokenRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RefreshTokenServiceTest {
    private static final long REFRESH_TOKEN_LIFETIME_MS = Duration.ofDays(14).toMillis();

    private final RefreshTokenRepository repository = mock(RefreshTokenRepository.class);
    private final RefreshTokenService service = createService();

    private RefreshTokenService createService() {
        RefreshTokenService created = new RefreshTokenService(repository, mock(PlatformTransactionManager.class));
        ReflectionTestUtils.setField(created, "refreshExpirationMs", REFRESH_TOKEN_LIFETIME_MS);
        return created;
    }

    @Test
    void createdRefreshTokenIsHashedAndExpiresAfterFourteenDays() {
        when(repository.save(any(RefreshToken.class))).thenAnswer(invocation -> invocation.getArgument(0));
        User user = new User();
        LocalDateTime beforeCreate = LocalDateTime.now();

        String rawToken = service.createToken(user);

        LocalDateTime afterCreate = LocalDateTime.now();
        var tokenCaptor = org.mockito.ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).save(tokenCaptor.capture());
        RefreshToken savedToken = tokenCaptor.getValue();

        assertTrue(savedToken.getExpiresAt().compareTo(beforeCreate.plus(Duration.ofDays(14))) >= 0);
        assertTrue(savedToken.getExpiresAt().compareTo(afterCreate.plus(Duration.ofDays(14))) <= 0);
        assertEquals(64, savedToken.getTokenHash().length());
        assertFalse(savedToken.getTokenHash().equals(rawToken));
    }

    @Test
    void activeTokenIsConsumedThroughRowLockedLookupAndRevoked() {
        RefreshToken token = activeToken(enabledUser());
        when(repository.findByTokenHashForUpdate(anyString())).thenReturn(Optional.of(token));

        RefreshToken consumed = service.consumeToken("raw-token");

        assertNotNull(consumed.getRevokedAt());
        verify(repository).findByTokenHashForUpdate(anyString());
        verify(repository, never()).revokeAllActiveByUserId(any());
    }

    @Test
    void replayedRevokedTokenRevokesEveryActiveSessionOfTheUser() {
        User user = enabledUser();
        RefreshToken token = activeToken(user);
        token.setRevokedAt(LocalDateTime.now().minusMinutes(5));
        when(repository.findByTokenHashForUpdate(anyString())).thenReturn(Optional.of(token));
        when(repository.revokeAllActiveByUserId(user.getId())).thenReturn(2);

        assertThrows(AppException.class, () -> service.consumeToken("raw-token"));

        verify(repository).revokeAllActiveByUserId(user.getId());
    }

    @Test
    void expiredTokenIsRevokedAndRejectedWithoutFamilyRevocation() {
        RefreshToken token = activeToken(enabledUser());
        token.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(repository.findByTokenHashForUpdate(anyString())).thenReturn(Optional.of(token));

        assertThrows(AppException.class, () -> service.consumeToken("raw-token"));

        assertNotNull(token.getRevokedAt());
        verify(repository, never()).revokeAllActiveByUserId(any());
    }

    @Test
    void disabledAccountTokenIsRevokedAndRejected() {
        User user = enabledUser();
        user.setEnabled(false);
        RefreshToken token = activeToken(user);
        when(repository.findByTokenHashForUpdate(anyString())).thenReturn(Optional.of(token));

        assertThrows(AppException.class, () -> service.consumeToken("raw-token"));

        assertNotNull(token.getRevokedAt());
        verify(repository, never()).revokeAllActiveByUserId(any());
    }

    @Test
    void unknownTokenIsRejected() {
        when(repository.findByTokenHashForUpdate(anyString())).thenReturn(Optional.empty());

        assertThrows(AppException.class, () -> service.consumeToken("raw-token"));

        verify(repository, never()).revokeAllActiveByUserId(any());
    }

    private static User enabledUser() {
        User user = new User();
        user.setId(7L);
        user.setUsername("sayu");
        user.setEnabled(true);
        return user;
    }

    private static RefreshToken activeToken(User user) {
        RefreshToken token = new RefreshToken();
        token.setUser(user);
        token.setExpiresAt(LocalDateTime.now().plusDays(1));
        return token;
    }
}
