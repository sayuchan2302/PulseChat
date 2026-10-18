package com.chatapp.service;

import com.chatapp.model.AccountRole;
import com.chatapp.model.User;
import com.chatapp.repository.RefreshTokenRepository;
import com.chatapp.repository.UserRepository;
import com.chatapp.security.WebSocketSessionRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminAccountServiceTest {
    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private PresenceService presenceService;

    @Mock
    private WebSocketSessionRegistry webSocketSessionRegistry;

    @Test
    void disablingAnAccountClosesItsRealtimeSessions() {
        User bob = user(2L, "bob");
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.save(bob)).thenReturn(bob);

        service().updateStatus(2L, false, "admin");

        assertFalse(Boolean.TRUE.equals(bob.getEnabled()));
        assertFalse(Boolean.TRUE.equals(bob.getOnline()));
        verify(webSocketSessionRegistry).closeSessionsForUsername("bob");
        verify(refreshTokenRepository).revokeAllActiveByUserId(2L);
        verify(presenceService).broadcast(ArgumentMatchers.any());
    }

    @Test
    void enablingAnAccountLeavesRealtimeSessionsAlone() {
        User bob = user(2L, "bob");
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.save(bob)).thenReturn(bob);

        service().updateStatus(2L, true, "admin");

        verify(webSocketSessionRegistry, never()).closeSessionsForUsername(ArgumentMatchers.anyString());
    }

    private AdminAccountService service() {
        return new AdminAccountService(
                userRepository,
                refreshTokenRepository,
                presenceService,
                new AfterCommitExecutor(),
                webSocketSessionRegistry
        );
    }

    private static User user(Long id, String username) {
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setEnabled(true);
        user.setOnline(true);
        user.setAccountRole(AccountRole.USER);
        return user;
    }
}
