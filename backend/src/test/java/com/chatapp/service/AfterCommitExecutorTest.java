package com.chatapp.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AfterCommitExecutorTest {
    private final AfterCommitExecutor executor = new AfterCommitExecutor();

    @AfterEach
    void clearSynchronizations() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void runsImmediatelyWhenNoTransactionIsActive() {
        AtomicBoolean executed = new AtomicBoolean(false);

        executor.execute(() -> executed.set(true));

        assertTrue(executed.get());
    }

    @Test
    void defersExecutionUntilTheTransactionCommits() {
        AtomicBoolean executed = new AtomicBoolean(false);
        TransactionSynchronizationManager.initSynchronization();

        executor.execute(() -> executed.set(true));

        assertFalse(executed.get(), "the action must not run before the commit");
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(TransactionSynchronization::afterCommit);
        assertTrue(executed.get(), "the action must run once the transaction commits");
    }
}
