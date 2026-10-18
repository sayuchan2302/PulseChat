package com.chatapp.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory fixed-window rate limiter for the auth endpoints (login per IP + per account, register/refresh per IP).
 * Single-instance only: if the app is ever scaled behind a load balancer, move the counters to a shared store
 * (e.g. Redis) — otherwise each instance limits independently.
 */
@Component
public class RateLimitService {
    private static final int MAX_TRACKED_KEYS = 10_000;

    private final int loginMaxAttempts;
    private final int registerMaxAttempts;
    private final int refreshMaxAttempts;
    private final long windowMillis;
    private final Clock clock;
    private final ConcurrentHashMap<String, long[]> counters = new ConcurrentHashMap<>();

    @Autowired
    public RateLimitService(
            @Value("${app.rate-limit.login-max-attempts:10}") int loginMaxAttempts,
            @Value("${app.rate-limit.register-max-attempts:10}") int registerMaxAttempts,
            @Value("${app.rate-limit.refresh-max-attempts:60}") int refreshMaxAttempts,
            @Value("${app.rate-limit.window-seconds:900}") long windowSeconds) {
        this(loginMaxAttempts, registerMaxAttempts, refreshMaxAttempts, Duration.ofSeconds(windowSeconds), Clock.systemUTC());
    }

    RateLimitService(int loginMaxAttempts, int registerMaxAttempts, int refreshMaxAttempts, Duration window, Clock clock) {
        this.loginMaxAttempts = loginMaxAttempts;
        this.registerMaxAttempts = registerMaxAttempts;
        this.refreshMaxAttempts = refreshMaxAttempts;
        this.windowMillis = window.toMillis();
        this.clock = clock;
    }

    /** Consumes one attempt per IP and per account; a successful login clears the account counter. */
    public boolean allowLoginAttempt(String clientIp, String username) {
        boolean ipAllowed = consume("login-ip:" + clientIp, loginMaxAttempts);
        boolean accountAllowed = consume("login-account:" + normalize(username), loginMaxAttempts);
        return ipAllowed && accountAllowed;
    }

    public boolean allowRegisterAttempt(String clientIp) {
        return consume("register-ip:" + clientIp, registerMaxAttempts);
    }

    public boolean allowRefreshAttempt(String clientIp) {
        return consume("refresh-ip:" + clientIp, refreshMaxAttempts);
    }

    public void clearLoginAttempts(String username) {
        counters.remove("login-account:" + normalize(username));
    }

    private boolean consume(String key, int maxAttempts) {
        long now = clock.millis();
        pruneExpired(now);
        long[] counter = counters.computeIfAbsent(key, ignored -> new long[]{now, 0});
        synchronized (counter) {
            if (now - counter[0] >= windowMillis) {
                counter[0] = now;
                counter[1] = 0;
            }
            counter[1]++;
            return counter[1] <= maxAttempts;
        }
    }

    private void pruneExpired(long now) {
        if (counters.size() < MAX_TRACKED_KEYS) {
            return;
        }
        counters.entrySet().removeIf(entry -> now - entry.getValue()[0] >= windowMillis);
    }

    private static String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }
}
