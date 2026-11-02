package com.chatapp.controller;

import com.chatapp.dto.request.WebPushSubscriptionRequest;
import com.chatapp.dto.request.WebPushUnsubscribeRequest;
import com.chatapp.dto.response.VapidPublicKeyResponse;
import com.chatapp.service.WebPushService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/push")
@RequiredArgsConstructor
public class PushNotificationController {
    private final WebPushService webPushService;

    @GetMapping("/public-key")
    public ResponseEntity<VapidPublicKeyResponse> getPublicKey() {
        return ResponseEntity.ok(webPushService.getVapidPublicKey());
    }

    @PostMapping("/subscribe")
    public ResponseEntity<Void> subscribe(
            @Valid @RequestBody WebPushSubscriptionRequest request,
            Authentication authentication
    ) {
        webPushService.subscribe(authentication.getName(), request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/unsubscribe")
    public ResponseEntity<Void> unsubscribe(
            @Valid @RequestBody WebPushUnsubscribeRequest request,
            Authentication authentication
    ) {
        webPushService.unsubscribe(authentication.getName(), request.endpoint());
        return ResponseEntity.ok().build();
    }
}

