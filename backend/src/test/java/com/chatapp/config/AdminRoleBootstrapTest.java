package com.chatapp.config;

import com.chatapp.model.AccountRole;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AdminRoleBootstrapTest {

    @Test
    void skipsWhenNoUsernameConfigured() {
        UserRepository repository = mock(UserRepository.class);
        AdminRoleBootstrap bootstrap = bootstrapFor(repository, "");

        bootstrap.run(null);

        verifyNoInteractions(repository);
    }

    @Test
    void doesNothingWhenUsernameIsNotFound() {
        UserRepository repository = mock(UserRepository.class);
        when(repository.findByUsername("admin")).thenReturn(Optional.empty());
        AdminRoleBootstrap bootstrap = bootstrapFor(repository, "admin");

        bootstrap.run(null);

        verify(repository, never()).save(any(User.class));
    }

    @Test
    void promotesEnabledUserWhenNoEnabledAdminExists() {
        UserRepository repository = mock(UserRepository.class);
        User user = enabledUser("admin");
        when(repository.findByUsername("admin")).thenReturn(Optional.of(user));
        when(repository.existsByAccountRoleAndEnabledTrue(AccountRole.ADMIN)).thenReturn(false);
        AdminRoleBootstrap bootstrap = bootstrapFor(repository, "admin");

        bootstrap.run(null);

        assertEquals(AccountRole.ADMIN, user.getAccountRole());
        assertEquals(Boolean.TRUE, user.getEnabled());
        verify(repository).save(user);
    }

    @Test
    void doesNotPromoteWhenAnEnabledAdminAlreadyExists() {
        UserRepository repository = mock(UserRepository.class);
        User user = enabledUser("admin");
        when(repository.findByUsername("admin")).thenReturn(Optional.of(user));
        when(repository.existsByAccountRoleAndEnabledTrue(AccountRole.ADMIN)).thenReturn(true);
        AdminRoleBootstrap bootstrap = bootstrapFor(repository, "admin");

        bootstrap.run(null);

        assertEquals(AccountRole.USER, user.getAccountRole());
        verify(repository, never()).save(any(User.class));
    }

    @Test
    void neverReenablesADisabledAccount() {
        UserRepository repository = mock(UserRepository.class);
        User user = enabledUser("admin");
        user.setEnabled(false);
        when(repository.findByUsername("admin")).thenReturn(Optional.of(user));
        AdminRoleBootstrap bootstrap = bootstrapFor(repository, "admin");

        bootstrap.run(null);

        assertEquals(Boolean.FALSE, user.getEnabled());
        assertEquals(AccountRole.USER, user.getAccountRole());
        verify(repository, never()).save(any(User.class));
    }

    @Test
    void leavesExistingAdminAccountUntouched() {
        UserRepository repository = mock(UserRepository.class);
        User user = enabledUser("admin");
        user.setAccountRole(AccountRole.ADMIN);
        when(repository.findByUsername("admin")).thenReturn(Optional.of(user));
        AdminRoleBootstrap bootstrap = bootstrapFor(repository, "admin");

        bootstrap.run(null);

        assertEquals(AccountRole.ADMIN, user.getAccountRole());
        assertEquals(Boolean.TRUE, user.getEnabled());
        verify(repository, never()).save(any(User.class));
    }

    private static AdminRoleBootstrap bootstrapFor(UserRepository repository, String username) {
        AdminRoleBootstrap bootstrap = new AdminRoleBootstrap(repository);
        ReflectionTestUtils.setField(bootstrap, "bootstrapUsername", username);
        return bootstrap;
    }

    private static User enabledUser(String username) {
        User user = new User();
        user.setUsername(username);
        user.setEnabled(true);
        user.setAccountRole(AccountRole.USER);
        return user;
    }
}
