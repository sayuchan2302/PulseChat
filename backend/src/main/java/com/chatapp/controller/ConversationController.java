package com.chatapp.controller;

import com.chatapp.dto.response.UserResponse;
import com.chatapp.service.FriendshipService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/conversations")
@RequiredArgsConstructor
public class ConversationController {
    private final FriendshipService friendshipService;

    @GetMapping
    public List<UserResponse> listPrivateConversations(Authentication authentication) {
        return friendshipService.listPrivateConversations(authentication.getName());
    }
}
