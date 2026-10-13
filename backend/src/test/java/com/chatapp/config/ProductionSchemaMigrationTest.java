package com.chatapp.config;

import org.flywaydb.core.Flyway;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.ResultSet;

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

        assertEquals(2, flyway.migrate().migrationsExecuted);
        try (Connection connection = dataSource.getConnection();
             ResultSet tables = connection.getMetaData().getTables(null, "PUBLIC", "MESSAGES", new String[]{"TABLE"})) {
            assertTrue(tables.next());
            try (ResultSet columns = connection.getMetaData().getColumns(null, "PUBLIC", "MESSAGES", "EDITED_AT")) {
                assertTrue(columns.next());
            }
        }
    }
}
