package com.chatapp.controller;

import com.chatapp.dto.request.UpdateAccountRoleRequest;
import com.chatapp.dto.request.UpdateAccountStatusRequest;
import com.chatapp.dto.response.AdminAccountPageResponse;
import com.chatapp.dto.response.AdminAccountResponse;
import com.chatapp.service.AdminAccountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/accounts")
@RequiredArgsConstructor
public class AdminAccountController {
    private final AdminAccountService adminAccountService;

    @GetMapping
    public AdminAccountPageResponse search(
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size
    ) {
        return adminAccountService.search(query, page, size);
    }

    @PatchMapping("/{userId}/role")
    public AdminAccountResponse updateRole(
            @PathVariable Long userId,
            @Valid @RequestBody UpdateAccountRoleRequest request,
            Authentication authentication
    ) {
        return adminAccountService.updateRole(userId, request.accountRole(), authentication.getName());
    }

    @PatchMapping("/{userId}/status")
    public AdminAccountResponse updateStatus(
            @PathVariable Long userId,
            @Valid @RequestBody UpdateAccountStatusRequest request,
            Authentication authentication
    ) {
        return adminAccountService.updateStatus(userId, request.enabled(), authentication.getName());
    }
}
