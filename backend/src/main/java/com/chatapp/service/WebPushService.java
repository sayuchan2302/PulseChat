package com.chatapp.service;

import com.chatapp.dto.request.WebPushSubscriptionRequest;
import com.chatapp.dto.response.VapidPublicKeyResponse;
import com.chatapp.model.User;
import com.chatapp.model.WebPushSubscription;
import com.chatapp.repository.UserRepository;
import com.chatapp.repository.WebPushSubscriptionRepository;
import com.chatapp.security.WebSocketSessionRegistry;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Utils;
import org.apache.http.HttpResponse;
import org.bouncycastle.jce.ECNamedCurveTable;
import org.bouncycastle.jce.interfaces.ECPublicKey;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.jce.spec.ECNamedCurveParameterSpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Security;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class WebPushService {
    private final WebPushSubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final WebSocketSessionRegistry webSocketSessionRegistry;
    private final ObjectMapper objectMapper;

    @Value("${vapid.public-key:}")
    private String configuredPublicKey;

    @Value("${vapid.private-key:}")
    private String configuredPrivateKey;

    @Value("${vapid.subject:mailto:admin@pulsechat.local}")
    private String vapidSubject;

    private PushService pushService;
    private String vapidPublicKeyBase64;

    @PostConstruct
    public void init() {
        try {
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(new BouncyCastleProvider());
            }

            pushService = new PushService();
            pushService.setSubject(vapidSubject);

            if (StringUtils.hasText(configuredPublicKey) && StringUtils.hasText(configuredPrivateKey)) {
                PublicKey pub = Utils.loadPublicKey(configuredPublicKey);
                PrivateKey priv = Utils.loadPrivateKey(configuredPrivateKey);
                pushService.setPublicKey(pub);
                pushService.setPrivateKey(priv);
                vapidPublicKeyBase64 = configuredPublicKey;
                log.info("Initialized WebPushService with configured VAPID keys");
            } else {
                KeyPairGenerator kpg = KeyPairGenerator.getInstance("ECDH", BouncyCastleProvider.PROVIDER_NAME);
                ECNamedCurveParameterSpec ecSpec = ECNamedCurveTable.getParameterSpec("prime256v1");
                kpg.initialize(ecSpec);
                KeyPair keyPair = kpg.generateKeyPair();
                pushService.setPublicKey(keyPair.getPublic());
                pushService.setPrivateKey(keyPair.getPrivate());
                byte[] encodedPoint = Utils.encode((ECPublicKey) keyPair.getPublic());
                vapidPublicKeyBase64 = Base64.getUrlEncoder().withoutPadding().encodeToString(encodedPoint);
                log.info("Initialized WebPushService with ephemeral VAPID keys for development");
            }
        } catch (Exception e) {
            log.error("Failed to initialize WebPushService: {}", e.getMessage(), e);
        }
    }

    public VapidPublicKeyResponse getVapidPublicKey() {
        return new VapidPublicKeyResponse(vapidPublicKeyBase64);
    }

    @Transactional
    public void subscribe(String username, WebPushSubscriptionRequest request) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + username));

        WebPushSubscription subscription = subscriptionRepository.findByEndpoint(request.endpoint())
                .orElseGet(() -> {
                    WebPushSubscription newSub = new WebPushSubscription();
                    newSub.setEndpoint(request.endpoint());
                    return newSub;
                });

        subscription.setUser(user);
        subscription.setP256dh(request.p256dh());
        subscription.setAuth(request.auth());
        subscription.setUserAgent(request.userAgent());
        subscription.setUpdatedAt(LocalDateTime.now());
        subscriptionRepository.save(subscription);
        log.debug("Saved WebPush subscription for user: {}", username);
    }

    @Transactional
    public void unsubscribe(String username, String endpoint) {
        subscriptionRepository.deleteByEndpoint(endpoint);
        log.debug("Deleted WebPush subscription for user: {}", username);
    }

    public boolean shouldSendPush(String username) {
        return !webSocketSessionRegistry.hasActiveSessions(username);
    }

    @Async
    public void sendPushIfInactive(String username, String title, String body, String url, String tag) {
        if (!shouldSendPush(username)) {
            log.debug("Skipping push notification for {} because user has active websocket session", username);
            return;
        }
        sendPush(username, title, body, url, tag);
    }

    @Async
    public void sendPush(String username, String title, String body, String url, String tag) {
        if (pushService == null) {
            log.warn("WebPushService not initialized, cannot send push");
            return;
        }

        List<WebPushSubscription> subscriptions = subscriptionRepository.findByUsername(username);
        if (subscriptions.isEmpty()) {
            return;
        }

        Map<String, Object> payloadMap = Map.of(
                "title", title,
                "body", body != null ? body : "",
                "url", url != null ? url : "/chat",
                "tag", tag != null ? tag : "pulsechat-notification",
                "timestamp", System.currentTimeMillis()
        );

        String payloadJson;
        try {
            payloadJson = objectMapper.writeValueAsString(payloadMap);
        } catch (Exception e) {
            log.error("Failed to serialize push payload: {}", e.getMessage());
            return;
        }

        for (WebPushSubscription sub : subscriptions) {
            try {
                Notification notification = new Notification(
                        sub.getEndpoint(),
                        sub.getP256dh(),
                        sub.getAuth(),
                        payloadJson.getBytes(StandardCharsets.UTF_8)
                );
                HttpResponse response = pushService.send(notification);
                int statusCode = response.getStatusLine().getStatusCode();
                log.debug("Push notification sent to {} (endpoint: {}), status: {}", username, sub.getEndpoint(), statusCode);

                if (statusCode == 404 || statusCode == 410) {
                    log.info("Push subscription expired (status {}), removing endpoint: {}", statusCode, sub.getEndpoint());
                    subscriptionRepository.deleteByEndpoint(sub.getEndpoint());
                }
            } catch (Exception e) {
                log.warn("Failed to deliver push notification to {}: {}", username, e.getMessage());
            }
        }
    }
}
