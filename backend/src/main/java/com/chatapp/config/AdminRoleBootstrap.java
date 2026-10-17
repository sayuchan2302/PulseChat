package com.chatapp.config;

import com.chatapp.model.AccountRole;
import com.chatapp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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

        userRepository.findByUsername(bootstrapUsername.trim()).ifPresentOrElse(user -> {
            user.setAccountRole(AccountRole.ADMIN);
            user.setEnabled(true);
            userRepository.save(user);
            log.info("Configured bootstrap account has admin access.");
        }, () -> log.warn("Configured admin bootstrap username was not found; no account was promoted."));
    }
}
