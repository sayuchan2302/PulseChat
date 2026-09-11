package com.chatapp.security;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Set;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {
    private static final Set<String> SEND_DESTINATIONS = Set.of(
            "/app/chat.send", "/app/chat.typing", "/app/chat.read", "/app/calls.signal");
    private static final Pattern ROOM_SEND_DESTINATION = Pattern.compile("/app/rooms/[1-9][0-9]*/(send|typing)");
    private static final Set<String> SUBSCRIBE_DESTINATIONS = Set.of(
            "/topic/presence", "/user/queue/messages", "/user/queue/message-updates",
            "/user/queue/typing", "/user/queue/read-receipts", "/user/queue/room-read-receipts",
            "/user/queue/rooms", "/user/queue/friend-requests", "/user/queue/calls");
    private final JwtService jwtService;
    private final CustomUserDetailsService userDetailsService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null) {
            StompCommand command = accessor.getCommand();
            if (StompCommand.CONNECT.equals(command)) {
                authenticate(accessor);
            } else if (command != null && command != StompCommand.DISCONNECT) {
                if (!(accessor.getUser() instanceof Authentication authentication)
                        || !authentication.isAuthenticated()) {
                    throw new AuthenticationCredentialsNotFoundException("WebSocket authentication is required");
                }
                String destination = accessor.getDestination();
                boolean allowed = switch (command) {
                    case SEND -> destination != null && (SEND_DESTINATIONS.contains(destination)
                            || ROOM_SEND_DESTINATION.matcher(destination).matches());
                    case SUBSCRIBE -> destination != null && SUBSCRIBE_DESTINATIONS.contains(destination);
                    case UNSUBSCRIBE -> true;
                    default -> false;
                };
                if (!allowed) {
                    throw new AccessDeniedException("WebSocket destination is not allowed");
                }
            }
        }

        return message;
    }

    private void authenticate(StompHeaderAccessor accessor) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (!StringUtils.hasText(authHeader) || !authHeader.startsWith("Bearer ")) {
            throw new AuthenticationCredentialsNotFoundException("Missing WebSocket authorization header");
        }

        String token = authHeader.substring(7);

        try {
            String username = jwtService.extractUsername(token);
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            if (!jwtService.isTokenValid(token, userDetails)) {
                throw new BadCredentialsException("Invalid WebSocket token");
            }

            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    userDetails,
                    null,
                    userDetails.getAuthorities()
            );
            accessor.setUser(authentication);
        } catch (RuntimeException exception) {
            throw new BadCredentialsException("Invalid WebSocket token", exception);
        }
    }
}
