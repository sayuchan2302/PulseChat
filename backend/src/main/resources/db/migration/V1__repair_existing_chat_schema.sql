DO $$
BEGIN
    IF to_regclass('public.messages') IS NOT NULL THEN
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS type varchar(20);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url varchar(2048);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_public_id varchar(255);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_resource_type varchar(20);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_format varchar(20);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_bytes bigint;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_width integer;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_height integer;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_duration double precision;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS link_preview_url varchar(2048);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS link_preview_title varchar(255);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS link_preview_description varchar(500);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS link_preview_image_url varchar(2048);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS link_preview_domain varchar(255);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_id varchar(100);
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_message_id bigint;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS recalled boolean NOT NULL DEFAULT false;
        ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at timestamp(6);

        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_message_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(chat_room_id, id)';

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_messages_reply_to_message'
        ) THEN
            ALTER TABLE public.messages
                ADD CONSTRAINT fk_messages_reply_to_message
                FOREIGN KEY (reply_to_message_id)
                REFERENCES public.messages(id);
        END IF;
    END IF;

    IF to_regclass('public.chat_rooms') IS NOT NULL THEN
        ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS owner_id bigint;
        ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS updated_at timestamp(6);

        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_chat_rooms_owner ON public.chat_rooms(owner_id)';

        IF to_regclass('public.users') IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_chat_rooms_owner'
            )
        THEN
            ALTER TABLE public.chat_rooms
                ADD CONSTRAINT fk_chat_rooms_owner
                FOREIGN KEY (owner_id)
                REFERENCES public.users(id);
        END IF;
    END IF;

    IF to_regclass('public.message_reactions') IS NULL
        AND to_regclass('public.messages') IS NOT NULL
        AND to_regclass('public.users') IS NOT NULL
    THEN
        CREATE TABLE public.message_reactions (
            id bigserial PRIMARY KEY,
            message_id bigint NOT NULL,
            user_id bigint NOT NULL,
            emoji varchar(32) NOT NULL,
            created_at timestamp(6),
            updated_at timestamp(6),
            CONSTRAINT uk_message_reaction_user UNIQUE (message_id, user_id),
            CONSTRAINT fk_message_reactions_message
                FOREIGN KEY (message_id)
                REFERENCES public.messages(id),
            CONSTRAINT fk_message_reactions_user
                FOREIGN KEY (user_id)
                REFERENCES public.users(id)
        );
    END IF;

    IF to_regclass('public.message_reactions') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions(user_id)';
    END IF;
END $$;
