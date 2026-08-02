package com.chatapp.controller;

import com.chatapp.dto.response.UserResponse;
import com.chatapp.service.AuthService;
import com.chatapp.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {
    private final AuthService authService;
    private final UserService userService;

    @GetMapping("/me")
    public UserResponse me(Authentication authentication) {
        return authService.getCurrentUser(authentication.getName());
    }

    @GetMapping
    public List<UserResponse> listUsers(
            Authentication authentication,
            @RequestParam(required = false) String username
    ) {
        return userService.listOtherUsers(authentication.getName(), username);
    }
}
