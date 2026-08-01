package com.chatapp.websocket;

import com.chatapp.dto.response.PresenceResponse;
import com.chatapp.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
@RequiredArgsConstructor
public class WebSocketPresenceEventListener {
    private static final String PRESENCE_TOPIC = "/topic/presence";

    private final UserService userService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ConcurrentMap<String, Set<String>> sessionsByUsername = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, String> usernamesBySessionId = new ConcurrentHashMap<>();

    @EventListener
    public void handleApplicationReady(ApplicationReadyEvent event) {
        userService.resetOnlineStatuses();
    }

    @EventListener
    public void handleConnect(SessionConnectedEvent event) {
        Principal principal = event.getUser();
        String sessionId = sessionId(event);

        if (principal == null || sessionId == null) {
            return;
        }

        String username = principal.getName();
        usernamesBySessionId.put(sessionId, username);

        Set<String> sessionIds = sessionsByUsername.computeIfAbsent(
                username,
                ignored -> ConcurrentHashMap.newKeySet()
        );
        boolean wasOffline = sessionIds.isEmpty();
        sessionIds.add(sessionId);

        if (wasOffline) {
            publishPresence(username, true);
        }
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        String sessionId = event.getSessionId();
        String username = usernamesBySessionId.remove(sessionId);

        if (username == null && event.getUser() != null) {
            username = event.getUser().getName();
        }

        if (username == null) {
            return;
        }

        Set<String> sessionIds = sessionsByUsername.get(username);
        if (sessionIds == null) {
            return;
        }

        sessionIds.remove(sessionId);
        if (!sessionIds.isEmpty()) {
            return;
        }

        sessionsByUsername.remove(username, sessionIds);
        publishPresence(username, false);
    }

    private void publishPresence(String username, boolean online) {
        PresenceResponse presence = userService.updateOnlineStatus(username, online);
        messagingTemplate.convertAndSend(PRESENCE_TOPIC, presence);
    }

    private String sessionId(SessionConnectedEvent event) {
        return StompHeaderAccessor.wrap(event.getMessage()).getSessionId();
    }
}
