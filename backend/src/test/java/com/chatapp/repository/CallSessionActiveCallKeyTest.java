package com.chatapp.repository;

import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.model.CallSession.CallType;
import com.chatapp.model.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The active-call unique indexes are the database half of the invite race protection:
 * the service pre-check can be bypassed by concurrent invites, the indexes cannot.
 */
@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect"
})
class CallSessionActiveCallKeyTest {
    @Autowired TestEntityManager entityManager;
    @Autowired CallSessionRepository callSessions;

    @Test
    void databaseRejectsASecondActiveCallForTheSameCaller() {
        User alice = user("alice");
        User bob = user("bob");
        User carol = user("carol");
        activeCall(alice, bob);

        CallSession second = pendingCall(alice, carol);

        assertThrows(DataIntegrityViolationException.class, () -> callSessions.saveAndFlush(second));
    }

    @Test
    void databaseRejectsASecondActiveCallForTheSameReceiver() {
        User alice = user("alice");
        User bob = user("bob");
        User carol = user("carol");
        activeCall(alice, bob);

        CallSession second = pendingCall(carol, bob);

        assertThrows(DataIntegrityViolationException.class, () -> callSessions.saveAndFlush(second));
    }

    @Test
    void terminalStatusesReleaseTheActiveKey() {
        User alice = user("alice");
        User bob = user("bob");
        User carol = user("carol");
        CallSession first = activeCall(alice, bob);

        first.setStatus(CallStatus.ENDED);
        callSessions.saveAndFlush(first);

        CallSession second = pendingCall(alice, carol);
        assertDoesNotThrow(() -> callSessions.saveAndFlush(second));
    }

    private User user(String name) {
        User user = new User();
        user.setUsername(name);
        user.setPassword("unused");
        user.setEmail(name + "@example.test");
        return entityManager.persistAndFlush(user);
    }

    private CallSession activeCall(User caller, User receiver) {
        CallSession callSession = pendingCall(caller, receiver);
        callSession.setStatus(CallStatus.ACCEPTED);
        return callSessions.saveAndFlush(callSession);
    }

    private static CallSession pendingCall(User caller, User receiver) {
        CallSession callSession = new CallSession();
        callSession.setCaller(caller);
        callSession.setReceiver(receiver);
        callSession.setType(CallType.AUDIO);
        callSession.setStatus(CallStatus.RINGING);
        return callSession;
    }
}
