package com.chatapp.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.User;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WebSocketAuthChannelInterceptorTest {
    private final JwtService jwt = mock(JwtService.class);
    private final CustomUserDetailsService users = mock(CustomUserDetailsService.class);
    private final WebSocketAuthChannelInterceptor interceptor = new WebSocketAuthChannelInterceptor(jwt, users);

    @Test
    void connectValidatesJwtAndSetsAuthenticatedPrincipal() {
        var user = User.withUsername("alice").password("unused").authorities("USER").build();
        when(jwt.extractUsername("valid")).thenReturn("alice");
        when(users.loadUserByUsername("alice")).thenReturn(user);
        when(jwt.isTokenValid("valid", user)).thenReturn(true);
        var accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setNativeHeader("Authorization", "Bearer valid");
        accessor.setLeaveMutable(true);
        var message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
        interceptor.preSend(message, null);
        assertEquals("alice", accessor.getUser().getName());
    }

    @Test
    void connectRejectsMissingOrInvalidTokens() {
        assertThrows(AuthenticationCredentialsNotFoundException.class,
                () -> interceptor.preSend(frame(StompCommand.CONNECT, null, false), null));
        var accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setNativeHeader("Authorization", "Bearer invalid");
        when(jwt.extractUsername("invalid")).thenThrow(new IllegalArgumentException());
        assertThrows(BadCredentialsException.class, () -> interceptor.preSend(
                MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders()), null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/topic/presence", "/queue/messages", "/user/bob/queue/messages", "/user/queue/messages",
            "/app/unknown", "/app/rooms/1/send/extra", "/app/rooms/../send"})
    void rejectsPublishingOutsideApplicationEndpoints(String destination) {
        assertThrows(AccessDeniedException.class,
                () -> interceptor.preSend(frame(StompCommand.SEND, destination, true), null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/queue/messages-user123", "/topic/secret", "/user/bob/queue/messages",
            "/user/queue/unknown", "/user/queue/**", "/app/chat.send"})
    void rejectsRawAndOtherUsersSubscriptions(String destination) {
        assertThrows(AccessDeniedException.class,
                () -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, destination, true), null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/app/chat.send", "/app/chat.typing", "/app/chat.read", "/app/calls.signal",
            "/app/rooms/12/send", "/app/rooms/12/typing"})
    void allowsExistingApplicationEndpoints(String destination) {
        assertDoesNotThrow(() -> interceptor.preSend(frame(StompCommand.SEND, destination, true), null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/topic/presence", "/user/queue/messages", "/user/queue/message-updates",
            "/user/queue/typing", "/user/queue/read-receipts", "/user/queue/room-read-receipts",
            "/user/queue/rooms", "/user/queue/friend-requests", "/user/queue/calls"})
    void allowsExistingOwnSubscriptions(String destination) {
        assertDoesNotThrow(() -> interceptor.preSend(frame(StompCommand.SUBSCRIBE, destination, true), null));
    }

    @Test
    void rejectsUnauthenticatedSendAndSubscribeButAllowsDisconnectCleanup() {
        for (var command : List.of(StompCommand.SEND, StompCommand.SUBSCRIBE)) {
            assertThrows(AuthenticationCredentialsNotFoundException.class,
                    () -> interceptor.preSend(frame(command, "/user/queue/messages", false), null));
        }
        assertDoesNotThrow(() -> interceptor.preSend(frame(StompCommand.DISCONNECT, null, false), null));
    }

    private Message<byte[]> frame(StompCommand command, String destination, boolean authenticated) {
        var accessor = StompHeaderAccessor.create(command);
        if (destination != null) accessor.setDestination(destination);
        if (authenticated) accessor.setUser(new UsernamePasswordAuthenticationToken("alice", null, List.of()));
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
