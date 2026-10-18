package com.chatapp.controller;

import com.chatapp.dto.response.AdminAuditLogPageResponse;
import com.chatapp.service.AdminAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/audit-logs")
@RequiredArgsConstructor
public class AdminAuditLogController {
    private final AdminAccountService adminAccountService;

    @GetMapping
    public AdminAuditLogPageResponse list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size
    ) {
        return adminAccountService.listAuditLogs(page, size);
    }
}
