package com.chatapp.controller;

import com.chatapp.dto.request.LoginRequest;
import com.chatapp.dto.response.AuthResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.User;
import com.chatapp.security.RefreshTokenCookieService;
import com.chatapp.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.http.Cookie;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {
    private static final String REFRESH_TOKEN = "refresh-token-value";

    @Mock
    private AuthService authService;

    private AuthController controller;

    @BeforeEach
    void setUp() {
        RefreshTokenCookieService cookieService = new RefreshTokenCookieService(
                "chat_refresh_token",
                "/api/auth",
                true,
                "Lax",
                604_800_000L
        );
        controller = new AuthController(authService, cookieService);
    }

    @Test
    void loginReturnsAccessTokenAndSetsHttpOnlyRefreshCookie() {
        when(authService.login(any(LoginRequest.class))).thenReturn(authResult());
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        ResponseEntity<AuthResponse> response = controller.login(
                new LoginRequest("sayu", "password"),
                servletResponse
        );

        String cookie = servletResponse.getHeader(HttpHeaders.SET_COOKIE);
        assertEquals(200, response.getStatusCode().value());
        assertEquals("access-token", response.getBody().token());
        assertTrue(cookie.contains("chat_refresh_token=" + REFRESH_TOKEN));
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("Secure"));
        assertTrue(cookie.contains("SameSite=Lax"));
        assertFalse(Arrays.stream(AuthResponse.class.getRecordComponents())
                .anyMatch(component -> component.getName().equals("refreshToken")));
    }

    @Test
    void refreshReadsCookieAndRotatesIt() {
        when(authService.refresh(REFRESH_TOKEN)).thenReturn(authResult());
        MockHttpServletRequest servletRequest = new MockHttpServletRequest();
        servletRequest.setCookies(new Cookie("chat_refresh_token", REFRESH_TOKEN));
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        ResponseEntity<AuthResponse> response = controller.refresh(servletRequest, servletResponse);

        assertEquals("access-token", response.getBody().token());
        assertTrue(servletResponse.getHeader(HttpHeaders.SET_COOKIE).contains("HttpOnly"));
        verify(authService).refresh(REFRESH_TOKEN);
    }

    @Test
    void logoutRevokesCookieTokenAndExpiresCookie() {
        MockHttpServletRequest servletRequest = new MockHttpServletRequest();
        servletRequest.setCookies(new Cookie("chat_refresh_token", REFRESH_TOKEN));
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        ResponseEntity<Void> response = controller.logout(servletRequest, servletResponse);

        assertEquals(204, response.getStatusCode().value());
        assertTrue(servletResponse.getHeader(HttpHeaders.SET_COOKIE).contains("Max-Age=0"));
        verify(authService).logout(REFRESH_TOKEN);
    }

    @Test
    void refreshWithoutCookieClearsCookieAndReturnsUnauthorizedError() {
        MockHttpServletResponse servletResponse = new MockHttpServletResponse();

        AppException exception = assertThrows(
                AppException.class,
                () -> controller.refresh(new MockHttpServletRequest(), servletResponse)
        );

        assertEquals(ErrorCode.INVALID_REFRESH_TOKEN, exception.getErrorCode());
        assertTrue(servletResponse.getHeader(HttpHeaders.SET_COOKIE).contains("Max-Age=0"));
    }

    private AuthService.AuthResult authResult() {
        User user = new User();
        user.setId(1L);
        user.setUsername("sayu");
        user.setEmail("sayu@example.com");
        user.setOnline(false);
        return new AuthService.AuthResult(
                new AuthResponse("access-token", UserResponse.from(user)),
                REFRESH_TOKEN
        );
    }
}
