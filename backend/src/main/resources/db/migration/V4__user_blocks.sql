CREATE TABLE user_blocks (
    id BIGSERIAL PRIMARY KEY,
    blocker_id BIGINT NOT NULL,
    blocked_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_blocks_blocker_blocked UNIQUE (blocker_id, blocked_user_id),
    CONSTRAINT ck_user_blocks_not_self CHECK (blocker_id <> blocked_user_id),
    CONSTRAINT fk_user_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_blocks_blocked FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_id, created_at);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_user_id);
