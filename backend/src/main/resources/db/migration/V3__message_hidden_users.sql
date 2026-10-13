CREATE TABLE message_hidden_users (
    message_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    CONSTRAINT pk_message_hidden_users PRIMARY KEY (message_id, user_id),
    CONSTRAINT fk_message_hidden_users_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_message_hidden_users_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_message_hidden_users_user_id ON message_hidden_users(user_id);
