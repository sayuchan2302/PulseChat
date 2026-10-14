package com.chatapp.service;

import com.chatapp.model.RefreshToken;
import com.chatapp.model.User;
import com.chatapp.repository.RefreshTokenRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RefreshTokenServiceTest {
    private static final long REFRESH_TOKEN_LIFETIME_MS = Duration.ofDays(14).toMillis();

    @Test
    void createdRefreshTokenIsHashedAndExpiresAfterFourteenDays() {
        RefreshTokenRepository repository = mock(RefreshTokenRepository.class);
        when(repository.save(any(RefreshToken.class))).thenAnswer(invocation -> invocation.getArgument(0));
        RefreshTokenService service = new RefreshTokenService(repository);
        ReflectionTestUtils.setField(service, "refreshExpirationMs", REFRESH_TOKEN_LIFETIME_MS);
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
}
