package com.chatapp.service;

import com.chatapp.dto.response.AdminAuditLogPageResponse;
import com.chatapp.model.AccountRole;
import com.chatapp.model.AdminAuditLog;
import com.chatapp.model.AdminAuditLog.AuditAction;
import com.chatapp.model.User;
import com.chatapp.repository.AdminAuditLogRepository;
import com.chatapp.repository.RefreshTokenRepository;
import com.chatapp.repository.UserRepository;
import com.chatapp.security.WebSocketSessionRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

    @Mock
    private AdminAuditLogRepository adminAuditLogRepository;

    @Test
    void disablingAnAccountClosesItsRealtimeSessionsAndAuditsTheChange() {
        User admin = user(1L, "admin");
        User bob = user(2L, "bob");
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(admin));
        when(userRepository.save(bob)).thenReturn(bob);

        service().updateStatus(2L, false, "admin");

        assertFalse(Boolean.TRUE.equals(bob.getEnabled()));
        assertFalse(Boolean.TRUE.equals(bob.getOnline()));
        verify(webSocketSessionRegistry).closeSessionsForUsername("bob");
        verify(refreshTokenRepository).revokeAllActiveByUserId(2L);
        verify(presenceService).broadcast(ArgumentMatchers.any());

        AdminAuditLog audit = capturedAudit();
        assertEquals(AuditAction.STATUS_CHANGE, audit.getAction());
        assertEquals(admin, audit.getActor());
        assertEquals(bob, audit.getTarget());
        assertEquals("true", audit.getPreviousValue());
        assertEquals("false", audit.getNewValue());
    }

    @Test
    void disablingAnAlreadyDisabledAccountSkipsTheAuditEntry() {
        User bob = user(2L, "bob");
        bob.setEnabled(false);
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.save(bob)).thenReturn(bob);

        service().updateStatus(2L, false, "admin");

        verify(adminAuditLogRepository, never()).save(ArgumentMatchers.any());
    }

    @Test
    void roleChangesAreAudited() {
        User admin = user(1L, "admin");
        User bob = user(2L, "bob");
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.findByUsername("admin")).thenReturn(Optional.of(admin));
        when(userRepository.save(bob)).thenReturn(bob);

        service().updateRole(2L, AccountRole.ADMIN, "admin");

        assertEquals(AccountRole.ADMIN, bob.getAccountRole());
        AdminAuditLog audit = capturedAudit();
        assertEquals(AuditAction.ROLE_CHANGE, audit.getAction());
        assertEquals("USER", audit.getPreviousValue());
        assertEquals("ADMIN", audit.getNewValue());
    }

    @Test
    void unchangedRoleSkipsTheAuditEntry() {
        User bob = user(2L, "bob");
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.save(bob)).thenReturn(bob);

        service().updateRole(2L, AccountRole.USER, "admin");

        verify(adminAuditLogRepository, never()).save(ArgumentMatchers.any());
    }

    @Test
    void enablingAnAccountLeavesRealtimeSessionsAlone() {
        User bob = user(2L, "bob");
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.save(bob)).thenReturn(bob);

        service().updateStatus(2L, true, "admin");

        verify(webSocketSessionRegistry, never()).closeSessionsForUsername(ArgumentMatchers.anyString());
    }

    @Test
    void auditLogsAreMappedForTheAdminListing() {
        User admin = user(1L, "admin");
        User bob = user(2L, "bob");
        AdminAuditLog audit = new AdminAuditLog();
        audit.setId(9L);
        audit.setActor(admin);
        audit.setTarget(bob);
        audit.setAction(AuditAction.STATUS_CHANGE);
        audit.setPreviousValue("true");
        audit.setNewValue("false");
        audit.setCreatedAt(LocalDateTime.now());
        when(adminAuditLogRepository.findPageWithParticipants(PageRequest.of(0, 25)))
                .thenReturn(new PageImpl<>(List.of(audit)));

        AdminAuditLogPageResponse response = service().listAuditLogs(0, 25);

        assertEquals(1, response.items().size());
        assertEquals("admin", response.items().get(0).actorUsername());
        assertEquals("bob", response.items().get(0).targetUsername());
        assertEquals("STATUS_CHANGE", response.items().get(0).action());
        assertEquals(1, response.totalPages());
    }

    private AdminAccountService service() {
        return new AdminAccountService(
                userRepository,
                refreshTokenRepository,
                presenceService,
                new AfterCommitExecutor(),
                webSocketSessionRegistry,
                adminAuditLogRepository
        );
    }

    private AdminAuditLog capturedAudit() {
        ArgumentCaptor<AdminAuditLog> captor = ArgumentCaptor.forClass(AdminAuditLog.class);
        verify(adminAuditLogRepository).save(captor.capture());
        return captor.getValue();
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
