package com.chatapp.service;

import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Runs realtime side effects (STOMP sends, presence fan-out) only after the current
 * transaction commits, so recipients can never observe a notification about state that
 * is not visible in the database yet. Falls back to immediate execution when no
 * transaction is active (for example in scheduled sweeps without a surrounding tx).
 */
@Component
public class AfterCommitExecutor {
    public void execute(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
