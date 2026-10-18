package com.chatapp.security;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RateLimitServiceTest {
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private final TestClock clock = new TestClock();
    private final RateLimitService service = new RateLimitService(3, 2, 5, 5, WINDOW, clock);

    @Test
    void loginAttemptsAreLimitedPerIpAndPerAccount() {
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertFalse(service.allowLoginAttempt("10.0.0.1", "sayu"));
    }

    @Test
    void otherAccountFromAnotherIpIsUnaffected() {
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertFalse(service.allowLoginAttempt("10.0.0.1", "sayu"));

        assertTrue(service.allowLoginAttempt("10.0.0.2", "thinh"));
    }

    @Test
    void countersResetAfterTheWindowElapses() {
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertFalse(service.allowLoginAttempt("10.0.0.1", "sayu"));

        clock.advance(WINDOW);

        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
    }

    @Test
    void successfulLoginClearsTheAccountCounter() {
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertTrue(service.allowLoginAttempt("10.0.0.1", "sayu"));
        assertFalse(service.allowLoginAttempt("10.0.0.2", "sayu"));

        service.clearLoginAttempts("SAYU ");

        assertTrue(service.allowLoginAttempt("10.0.0.2", "sayu"));
    }

    @Test
    void registerAndRefreshKeepSeparateBuckets() {
        assertTrue(service.allowRegisterAttempt("10.0.0.3"));
        assertTrue(service.allowRegisterAttempt("10.0.0.3"));
        assertFalse(service.allowRegisterAttempt("10.0.0.3"));

        assertTrue(service.allowRefreshAttempt("10.0.0.3"));
    }

    @Test
    void roomMemberAddsAreLimitedByInviteeCount() {
        assertTrue(service.allowRoomMemberAdds("sayu", 3));
        assertTrue(service.allowRoomMemberAdds("sayu", 2));
        assertFalse(service.allowRoomMemberAdds("sayu", 1));
    }

    @Test
    void roomMemberAddsKeepSeparateBucketsPerAccount() {
        assertFalse(service.allowRoomMemberAdds("sayu", 6));

        assertTrue(service.allowRoomMemberAdds("thinh", 5));
    }

    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-10-18T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }
    }
}
