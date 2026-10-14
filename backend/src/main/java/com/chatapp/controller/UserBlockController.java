package com.chatapp.controller;

import com.chatapp.dto.response.UserResponse;
import com.chatapp.service.UserBlockService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/blocks")
@RequiredArgsConstructor
public class UserBlockController {
    private final UserBlockService userBlockService;

    @GetMapping
    public List<UserResponse> listBlockedUsers(Authentication authentication) {
        return userBlockService.listBlockedUsers(authentication.getName());
    }

    @PutMapping("/{userId}")
    public UserResponse blockUser(Authentication authentication, @PathVariable Long userId) {
        return userBlockService.blockUser(authentication.getName(), userId);
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> unblockUser(Authentication authentication, @PathVariable Long userId) {
        userBlockService.unblockUser(authentication.getName(), userId);
        return ResponseEntity.noContent().build();
    }
}
