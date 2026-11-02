package com.chatapp.service;

import com.chatapp.dto.request.WebPushSubscriptionRequest;
import com.chatapp.dto.response.VapidPublicKeyResponse;
import com.chatapp.model.User;
import com.chatapp.model.WebPushSubscription;
import com.chatapp.repository.UserRepository;
import com.chatapp.repository.WebPushSubscriptionRepository;
import com.chatapp.security.WebSocketSessionRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WebPushServiceTest {

    @Mock
    private WebPushSubscriptionRepository subscriptionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private WebSocketSessionRegistry webSocketSessionRegistry;

    private WebPushService webPushService;

    @BeforeEach
    void setUp() {
        webPushService = new WebPushService(
                subscriptionRepository,
                userRepository,
                webSocketSessionRegistry,
                new ObjectMapper()
        );
        webPushService.init();
    }

    @Test
    void generatesEphemeralVapidPublicKeyWhenNotConfigured() {
        VapidPublicKeyResponse response = webPushService.getVapidPublicKey();
        assertNotNull(response);
        assertNotNull(response.publicKey());
        assertFalse(response.publicKey().isBlank());
    }

    @Test
    void subscribesUserSuccessfully() {
        User user = new User();
        user.setId(1L);
        user.setUsername("bob");

        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(user));
        when(subscriptionRepository.findByEndpoint("https://push.example.com/endpoint123")).thenReturn(Optional.empty());

        WebPushSubscriptionRequest request = new WebPushSubscriptionRequest(
                "https://push.example.com/endpoint123",
                "key-p256dh",
                "key-auth",
                "Mozilla/5.0"
        );

        webPushService.subscribe("bob", request);

        ArgumentCaptor<WebPushSubscription> captor = ArgumentCaptor.forClass(WebPushSubscription.class);
        verify(subscriptionRepository).save(captor.capture());

        WebPushSubscription saved = captor.getValue();
        assertEquals("https://push.example.com/endpoint123", saved.getEndpoint());
        assertEquals("key-p256dh", saved.getP256dh());
        assertEquals("key-auth", saved.getAuth());
        assertEquals("Mozilla/5.0", saved.getUserAgent());
        assertEquals(user, saved.getUser());
    }

    @Test
    void unsubscribesUserSuccessfully() {
        webPushService.unsubscribe("bob", "https://push.example.com/endpoint123");
        verify(subscriptionRepository).deleteByEndpoint("https://push.example.com/endpoint123");
    }

    @Test
    void shouldSendPushReturnsTrueOnlyWhenNoActiveWebSocketSession() {
        when(webSocketSessionRegistry.hasActiveSessions("offline_user")).thenReturn(false);
        when(webSocketSessionRegistry.hasActiveSessions("online_user")).thenReturn(true);

        assertTrue(webPushService.shouldSendPush("offline_user"));
        assertFalse(webPushService.shouldSendPush("online_user"));
    }
}

