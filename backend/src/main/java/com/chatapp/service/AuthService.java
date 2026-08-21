package com.chatapp.service;

import com.chatapp.dto.request.LoginRequest;
import com.chatapp.dto.request.RegisterRequest;
import com.chatapp.dto.response.AuthResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import com.chatapp.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;

    @Transactional
    public AuthResult register(RegisterRequest request) {
        String fullName = request.fullName().trim();
        String username = request.username().trim();
        String email = request.email().trim().toLowerCase(Locale.ROOT);

        if (userRepository.existsByUsername(username)) {
            throw new AppException(ErrorCode.USERNAME_ALREADY_EXISTS);
        }
        if (userRepository.existsByEmail(email)) {
            throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }

        User user = new User();
        user.setFullName(fullName);
        user.setUsername(username);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(request.password()));
        user.setOnline(false);

        User savedUser = userRepository.save(user);
        return createAuthResponse(savedUser);
    }

    @Transactional
    public AuthResult login(LoginRequest request) {
        String username = request.username().trim();

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, request.password())
            );
        } catch (AuthenticationException exception) {
            throw new AppException(ErrorCode.INVALID_CREDENTIALS);
        }

        User user = findUserByUsername(username);
        return createAuthResponse(user);
    }

    @Transactional
    public AuthResult refresh(String rawRefreshToken) {
        User user = refreshTokenService.consumeToken(rawRefreshToken).getUser();
        return createAuthResponse(user);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokenService.revokeToken(rawRefreshToken);
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(String username) {
        return UserResponse.from(findUserByUsername(username));
    }

    private User findUserByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private AuthResult createAuthResponse(User user) {
        String accessToken = jwtService.generateAccessToken(user.getUsername());
        String refreshToken = refreshTokenService.createToken(user);
        return new AuthResult(new AuthResponse(accessToken, UserResponse.from(user)), refreshToken);
    }

    public record AuthResult(AuthResponse response, String refreshToken) {
    }
}
