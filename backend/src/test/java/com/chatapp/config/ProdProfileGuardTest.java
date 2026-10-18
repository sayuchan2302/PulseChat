package com.chatapp.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProdProfileGuardTest {

    @Test
    void h2AndLocalhostDatabasesAreTreatedAsLocal() {
        assertTrue(ProdProfileGuard.isLocalDatabase("jdbc:h2:mem:testdb;MODE=PostgreSQL"));
        assertTrue(ProdProfileGuard.isLocalDatabase("jdbc:postgresql://localhost:5432/chat-app"));
        assertTrue(ProdProfileGuard.isLocalDatabase("jdbc:postgresql://127.0.0.1:5432/chat-app"));
        assertTrue(ProdProfileGuard.isLocalDatabase("jdbc:postgresql://[::1]:5432/chat-app"));
    }

    @Test
    void remoteDatabasesAreNotLocal() {
        assertFalse(ProdProfileGuard.isLocalDatabase("jdbc:postgresql://db.internal:5432/chat-app"));
        assertFalse(ProdProfileGuard.isLocalDatabase("jdbc:postgresql://10.0.0.5:5432/chat-app"));
        assertFalse(ProdProfileGuard.isLocalDatabase("jdbc:postgresql://chat.example.com/chat-app"));
    }

    @Test
    void blankUrlIsToleratedSoTheGuardNeverFailsOnMissingConfiguration() {
        assertTrue(ProdProfileGuard.isLocalDatabase(""));
        assertTrue(ProdProfileGuard.isLocalDatabase(null));
    }
}
