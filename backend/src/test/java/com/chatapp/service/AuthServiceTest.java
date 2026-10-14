package com.chatapp.service;

import com.chatapp.dto.request.LoginRequest;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import com.chatapp.security.JwtService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
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
        when(refreshTokenService.createToken(user)).thenReturn("opaque-refresh-token");

        AuthService.AuthResult result = authService.login(new LoginRequest(" thinh2302 ", "password"));

        assertEquals("signed-access-jwt", result.response().token());
        assertEquals("thinh2302", result.response().user().username());
        assertEquals("opaque-refresh-token", result.refreshToken());
        verify(authenticationManager).authenticate(any(UsernamePasswordAuthenticationToken.class));
        verify(refreshTokenService).createToken(user);
    }
}
