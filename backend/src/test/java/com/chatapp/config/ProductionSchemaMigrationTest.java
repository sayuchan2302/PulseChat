package com.chatapp.config;

import db.migration.V11__PostgresTrigramSearchIndex;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.migration.Context;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Objects;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductionSchemaMigrationTest {
    private static final long JAVA_MIGRATION_COUNT = 1L;
    @Test
    void createsTheProductionSchemaFromAnEmptyDatabase() throws Exception {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:production_schema;MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        dataSource.setUser("sa");

        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load();

        assertEquals(countClasspathMigrations(), flyway.migrate().migrationsExecuted);
        try (Connection connection = dataSource.getConnection();
             ResultSet tables = connection.getMetaData().getTables(null, "PUBLIC", "MESSAGES", new String[]{"TABLE"})) {
            assertTrue(tables.next());
            try (ResultSet columns = connection.getMetaData().getColumns(null, "PUBLIC", "MESSAGES", "EDITED_AT")) {
                assertTrue(columns.next());
            }
            try (ResultSet accountRoleColumn = connection.getMetaData().getColumns(null, "PUBLIC", "USERS", "ACCOUNT_ROLE")) {
                assertTrue(accountRoleColumn.next());
            }
            try (ResultSet enabledColumn = connection.getMetaData().getColumns(null, "PUBLIC", "USERS", "ENABLED")) {
                assertTrue(enabledColumn.next());
            }
            try (ResultSet hiddenMessages = connection.getMetaData().getTables(
                    null, "PUBLIC", "MESSAGE_HIDDEN_USERS", new String[]{"TABLE"})) {
                assertTrue(hiddenMessages.next());
            }
            try (ResultSet userBlocks = connection.getMetaData().getTables(
                    null, "PUBLIC", "USER_BLOCKS", new String[]{"TABLE"})) {
                assertTrue(userBlocks.next());
            }
            try (ResultSet pushSubs = connection.getMetaData().getTables(
                    null, "PUBLIC", "WEB_PUSH_SUBSCRIPTIONS", new String[]{"TABLE"})) {
                assertTrue(pushSubs.next());
            }
        }
    }

    @Test
    void createsPostgresTrigramSearchIndexesWhenRunningOnPostgreSQL() throws Exception {
        Context context = mock(Context.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metaData = mock(DatabaseMetaData.class);
        Statement statement = mock(Statement.class);

        when(context.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metaData);
        when(metaData.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(connection.createStatement()).thenReturn(statement);

        new V11__PostgresTrigramSearchIndex().migrate(context);

        verify(statement).execute("CREATE EXTENSION IF NOT EXISTS pg_trgm");
        verify(statement).execute(contains("idx_messages_content_trgm"));
        verify(statement).execute(contains("idx_messages_link_title_trgm"));
    }

    private static long countClasspathMigrations() throws Exception {
        Path migrationDirectory = Paths.get(
                Objects.requireNonNull(
                        ProductionSchemaMigrationTest.class.getClassLoader().getResource("db/migration")
                ).toURI()
        );
        try (Stream<Path> files = Files.list(migrationDirectory)) {
            long sqlMigrations = files.filter(path -> path.getFileName().toString().endsWith(".sql")).count();
            return sqlMigrations + JAVA_MIGRATION_COUNT;
        }
    }
}
