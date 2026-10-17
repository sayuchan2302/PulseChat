ALTER TABLE users
    ADD COLUMN account_role VARCHAR(20) NOT NULL DEFAULT 'USER',
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
    ADD CONSTRAINT ck_users_account_role CHECK (account_role IN ('USER', 'ADMIN'));
