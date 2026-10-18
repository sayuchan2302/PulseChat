package com.chatapp.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks live websocket sessions per username so an account that gets disabled can be
 * disconnected immediately. Because the principal is resolved once at CONNECT time and reused
 * for every later frame (no per-frame UserDetails reload), this registry is the enforcement
 * point that stops a disabled account from continuing to use an existing session.
 */
@Component
@Slf4j
public class WebSocketSessionRegistry implements WebSocketHandlerDecoratorFactory {
    static final CloseStatus ACCOUNT_DISABLED_CLOSE_STATUS =
            new CloseStatus(CloseStatus.POLICY_VIOLATION.getCode(), "This account is disabled");

    private final Map<String, WebSocketSession> sessionsById = new ConcurrentHashMap<>();
    private final Map<String, Set<String>> sessionIdsByUsername = new ConcurrentHashMap<>();

    @Override
    public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                sessionsById.put(session.getId(), session);
                super.afterConnectionEstablished(session);
            }

            @Override
            public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus) throws Exception {
                unregister(session.getId());
                super.afterConnectionClosed(session, closeStatus);
            }
        };
    }

    void linkUsername(String sessionId, String username) {
        if (sessionId == null) {
            return;
        }

        Set<String> sessionIds = sessionIdsByUsername.computeIfAbsent(
                username,
                key -> ConcurrentHashMap.newKeySet()
        );
        sessionIds.add(sessionId);
    }

    void unregister(String sessionId) {
        sessionsById.remove(sessionId);
        sessionIdsByUsername.values().forEach(sessionIds -> sessionIds.remove(sessionId));
    }

    /**
     * Closes every open session of the user and returns how many were closed. Safe to call for
     * users without sessions.
     */
    public int closeSessionsForUsername(String username) {
        Set<String> sessionIds = sessionIdsByUsername.remove(username);
        if (sessionIds == null) {
            return 0;
        }

        int closed = 0;
        for (String sessionId : sessionIds) {
            WebSocketSession session = sessionsById.remove(sessionId);
            if (session == null || !session.isOpen()) {
                continue;
            }

            try {
                session.close(ACCOUNT_DISABLED_CLOSE_STATUS);
                closed++;
            } catch (IOException exception) {
                log.debug("Unable to close websocket session {}", sessionId, exception);
            }
        }

        return closed;
    }
}
