package com.chatapp.service;

import com.chatapp.dto.request.LoginRequest;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.RefreshToken;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import com.chatapp.security.JwtService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {
    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private AuthenticationManager authenticationManager;

    @Mock
    private JwtService jwtService;

    @Mock
    private RefreshTokenService refreshTokenService;

    @InjectMocks
    private AuthService authService;

    @Test
    void loginReturnsAccessJwtAndCreatesRefreshToken() {
        User user = new User();
        user.setId(42L);
        user.setUsername("thinh2302");
        user.setFullName("Thinh");
        user.setEmail("thinh@example.com");
        user.setOnline(false);
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenReturn(new UsernamePasswordAuthenticationToken("thinh2302", null));
        when(userRepository.findByUsername("thinh2302")).thenReturn(Optional.of(user));
        when(jwtService.generateAccessToken("thinh2302")).thenReturn("signed-access-jwt");
        when(jwtService.generateMediaToken("thinh2302")).thenReturn("signed-media-jwt");
        when(refreshTokenService.createToken(user)).thenReturn("opaque-refresh-token");

        AuthService.AuthResult result = authService.login(new LoginRequest(" thinh2302 ", "password"));

        assertEquals("signed-access-jwt", result.response().token());
        assertEquals("thinh2302", result.response().user().username());
        assertEquals("opaque-refresh-token", result.refreshToken());
        assertEquals("signed-media-jwt", result.mediaToken());
        verify(authenticationManager).authenticate(any(UsernamePasswordAuthenticationToken.class));
        verify(refreshTokenService).createToken(user);
    }

    @Test
    void refreshRotatesTheRefreshTokenAndIssuesNewTokens() {
        User user = user();
        when(refreshTokenService.consumeToken("raw-refresh")).thenReturn(refreshTokenFor(user));
        when(jwtService.generateAccessToken("thinh2302")).thenReturn("new-access-jwt");
        when(jwtService.generateMediaToken("thinh2302")).thenReturn("new-media-jwt");
        when(refreshTokenService.createToken(user)).thenReturn("rotated-refresh-token");

        AuthService.AuthResult result = authService.refresh("raw-refresh");

        assertEquals("new-access-jwt", result.response().token());
        assertEquals("rotated-refresh-token", result.refreshToken());
        assertEquals("new-media-jwt", result.mediaToken());
        verify(refreshTokenService).consumeToken("raw-refresh");
        verify(refreshTokenService).createToken(user);
    }

    @Test
    void logoutRevokesTheRefreshToken() {
        authService.logout("raw-refresh");

        verify(refreshTokenService).revokeToken("raw-refresh");
    }

    @Test
    void loginRejectsDisabledAccounts() {
        when(authenticationManager.authenticate(any(UsernamePasswordAuthenticationToken.class)))
                .thenThrow(new DisabledException("account disabled"));

        AppException exception = assertThrows(
                AppException.class,
                () -> authService.login(new LoginRequest("sayu", "password"))
        );

        assertEquals(ErrorCode.INVALID_CREDENTIALS, exception.getErrorCode());
        verify(userRepository, never()).findByUsername(any());
    }

    private static User user() {
        User user = new User();
        user.setId(42L);
        user.setUsername("thinh2302");
        user.setFullName("Thinh");
        user.setEmail("thinh@example.com");
        user.setOnline(false);
        return user;
    }

    private static RefreshToken refreshTokenFor(User user) {
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUser(user);
        return refreshToken;
    }
}
