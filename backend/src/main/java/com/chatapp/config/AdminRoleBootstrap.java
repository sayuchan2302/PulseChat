package com.chatapp.config;

import com.chatapp.model.AccountRole;
import com.chatapp.model.User;
import com.chatapp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
public class AdminRoleBootstrap implements ApplicationRunner {
    private final UserRepository userRepository;

    @Value("${app.admin.bootstrap-username:}")
    private String bootstrapUsername;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (bootstrapUsername == null || bootstrapUsername.isBlank()) {
            log.info("No admin bootstrap username configured; existing account roles are unchanged.");
            return;
        }

        Optional<User> bootstrapAccount = userRepository.findByUsername(bootstrapUsername.trim());
        if (bootstrapAccount.isEmpty()) {
            log.warn("Configured admin bootstrap username was not found; no account was promoted.");
            return;
        }

        User user = bootstrapAccount.get();
        if (!Boolean.TRUE.equals(user.getEnabled())) {
            log.warn("Configured admin bootstrap account is disabled; no account was promoted.");
            return;
        }

        if (user.getAccountRole() == AccountRole.ADMIN) {
            return;
        }

        if (userRepository.existsByAccountRoleAndEnabledTrue(AccountRole.ADMIN)) {
            log.info("An enabled admin already exists; the configured bootstrap account was not promoted.");
            return;
        }

        user.setAccountRole(AccountRole.ADMIN);
        userRepository.save(user);
        log.info("Promoted the configured bootstrap account to admin because no enabled admin existed.");
    }
}
