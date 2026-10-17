package com.chatapp.config;

import org.flywaydb.core.Flyway;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.ResultSet;
import java.util.Objects;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductionSchemaMigrationTest {
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
        }
    }

    private static long countClasspathMigrations() throws Exception {
        Path migrationDirectory = Paths.get(
                Objects.requireNonNull(
                        ProductionSchemaMigrationTest.class.getClassLoader().getResource("db/migration")
                ).toURI()
        );
        try (Stream<Path> files = Files.list(migrationDirectory)) {
            return files.filter(path -> path.getFileName().toString().endsWith(".sql")).count();
        }
    }
}
