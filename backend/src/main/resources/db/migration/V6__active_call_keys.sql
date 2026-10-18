-- At most one active call per user, enforced by the database instead of trusting the
-- service-level pre-check that races under concurrent invites. The *_key columns mirror
-- caller_id/receiver_id while the call is RINGING/ACCEPTED and are cleared for every
-- terminal status by CallSession#syncActiveCallKeys, so a plain unique index is enough
-- and it works on both PostgreSQL and H2 (unlike filtered indexes).
--
-- Deliberately no backfill: pre-existing active rows keep NULL keys and stay protected by
-- the service pre-check, while a backfill could fail the index creation if duplicate
-- active calls already exist.
ALTER TABLE call_sessions
    ADD COLUMN active_caller_key BIGINT;

ALTER TABLE call_sessions
    ADD COLUMN active_receiver_key BIGINT;

CREATE UNIQUE INDEX uk_call_sessions_active_caller
    ON call_sessions (active_caller_key);

CREATE UNIQUE INDEX uk_call_sessions_active_receiver
    ON call_sessions (active_receiver_key);
