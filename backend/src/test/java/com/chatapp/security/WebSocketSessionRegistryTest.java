package com.chatapp.security;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketSessionRegistryTest {
    private final WebSocketSessionRegistry registry = new WebSocketSessionRegistry();

    @Test
    void closingSessionsForAUsernameClosesEveryOpenSession() throws Exception {
        WebSocketSession first = openSession("session-1");
        WebSocketSession second = openSession("session-2");
        WebSocketHandler decorated = registry.decorate(mock(WebSocketHandler.class));
        decorated.afterConnectionEstablished(first);
        decorated.afterConnectionEstablished(second);
        registry.linkUsername("session-1", "bob");
        registry.linkUsername("session-2", "bob");

        int closed = registry.closeSessionsForUsername("bob");

        assertEquals(2, closed);
        ArgumentCaptor<CloseStatus> status = ArgumentCaptor.forClass(CloseStatus.class);
        verify(first).close(status.capture());
        assertEquals(WebSocketSessionRegistry.ACCOUNT_DISABLED_CLOSE_STATUS.getCode(), status.getValue().getCode());
        assertEquals(WebSocketSessionRegistry.ACCOUNT_DISABLED_CLOSE_STATUS.getReason(), status.getValue().getReason());
        verify(second).close(any(CloseStatus.class));
        assertEquals(0, registry.closeSessionsForUsername("bob"));
    }

    @Test
    void closedSessionsAreNotTrackedAnymore() throws Exception {
        WebSocketSession session = openSession("session-1");
        WebSocketHandler decorated = registry.decorate(mock(WebSocketHandler.class));
        decorated.afterConnectionEstablished(session);
        registry.linkUsername("session-1", "bob");

        decorated.afterConnectionClosed(session, CloseStatus.NORMAL);

        assertEquals(0, registry.closeSessionsForUsername("bob"));
        verify(session, never()).close(any(CloseStatus.class));
    }

    @Test
    void usersWithoutSessionsAreIgnored() {
        assertEquals(0, registry.closeSessionsForUsername("nobody"));
    }

    private static WebSocketSession openSession(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
