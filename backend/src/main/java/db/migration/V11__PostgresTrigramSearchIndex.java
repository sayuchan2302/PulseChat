package db.migration;

import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.Statement;

/**
 * Enables PostgreSQL's pg_trgm extension and creates GIN trigram indexes on message search columns
 * to accelerate substring searches (lower(content) LIKE '%query%').
 * Safely no-ops on non-PostgreSQL databases (such as H2 in unit tests).
 */
@Slf4j
public class V11__PostgresTrigramSearchIndex extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        String productName = connection.getMetaData().getDatabaseProductName();
        if (productName == null || !productName.toLowerCase().contains("postgresql")) {
            log.debug("Skipping PostgreSQL pg_trgm search index creation on database product: {}", productName);
            return;
        }

        try (Statement statement = connection.createStatement()) {
            statement.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm");
            statement.execute("""
                    CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
                    ON messages USING gin (lower(content) gin_trgm_ops)
                    WHERE recalled = false
                    """);
            statement.execute("""
                    CREATE INDEX IF NOT EXISTS idx_messages_link_title_trgm
                    ON messages USING gin (lower(link_preview_title) gin_trgm_ops)
                    WHERE recalled = false AND link_preview_title IS NOT NULL
                    """);
        }
    }
}

