package com.chatapp.service;

import com.chatapp.dto.response.AdminAccountPageResponse;
import com.chatapp.dto.response.AdminAccountResponse;
import com.chatapp.dto.response.PresenceResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.AccountRole;
import com.chatapp.model.User;
import com.chatapp.repository.RefreshTokenRepository;
import com.chatapp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AdminAccountService {
    private static final int MAX_PAGE_SIZE = 100;

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PresenceService presenceService;

    @Transactional(readOnly = true)
    public AdminAccountPageResponse search(String query, int page, int size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Page<AdminAccountResponse> results = userRepository.searchAccounts(
                        normalizedQuery,
                        PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.ASC, "username"))
                )
                .map(AdminAccountResponse::from);
        return AdminAccountPageResponse.from(results);
    }

    @Transactional
    public AdminAccountResponse updateRole(Long userId, AccountRole accountRole, String adminUsername) {
        User user = findUser(userId);
        if (user.getUsername().equals(adminUsername) && user.getAccountRole() != accountRole) {
            throw new AppException(ErrorCode.ACCOUNT_SELF_CHANGE_NOT_ALLOWED);
        }

        if (user.getAccountRole() == AccountRole.ADMIN && accountRole != AccountRole.ADMIN) {
            long activeAdminCount = userRepository.findEnabledAccountsByRoleForUpdate(AccountRole.ADMIN).size();
            if (activeAdminCount <= 1) {
                throw new AppException(ErrorCode.ACCOUNT_LAST_ADMIN_REQUIRED);
            }
        }

        user.setAccountRole(accountRole);
        return AdminAccountResponse.from(userRepository.save(user));
    }

    @Transactional
    public AdminAccountResponse updateStatus(Long userId, boolean enabled, String adminUsername) {
        User user = findUser(userId);
        if (user.getUsername().equals(adminUsername) && !enabled) {
            throw new AppException(ErrorCode.ACCOUNT_SELF_CHANGE_NOT_ALLOWED);
        }

        if (!enabled && user.getAccountRole() == AccountRole.ADMIN && Boolean.TRUE.equals(user.getEnabled())) {
            long activeAdminCount = userRepository.findEnabledAccountsByRoleForUpdate(AccountRole.ADMIN).size();
            if (activeAdminCount <= 1) {
                throw new AppException(ErrorCode.ACCOUNT_LAST_ADMIN_REQUIRED);
            }
        }

        user.setEnabled(enabled);
        if (!enabled) {
            LocalDateTime now = LocalDateTime.now();
            boolean wasOnline = Boolean.TRUE.equals(user.getOnline());
            user.setOnline(false);
            user.setLastSeenAt(now);
            refreshTokenRepository.revokeAllActiveByUserId(user.getId());

            if (wasOnline) {
                presenceService.broadcast(new PresenceResponse(user.getId(), user.getUsername(), false, now));
            }
        }

        return AdminAccountResponse.from(userRepository.save(user));
    }

    private User findUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }
}
