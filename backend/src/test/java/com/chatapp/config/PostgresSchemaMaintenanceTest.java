package com.chatapp.config;

import com.chatapp.model.Message.MessageType;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import javax.sql.DataSource;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PostgresSchemaMaintenanceTest {

    @Test
    void messageTypeConstraintIncludesEveryMessageType() {
        String sql = PostgresSchemaMaintenance.messageTypeCheckConstraintSql();

        assertTrue(sql.contains("messages_type_check"));
        for (MessageType type : MessageType.values()) {
            assertTrue(sql.contains("'" + type.name() + "'"));
        }
    }

    @Test
    void prodProfileSkipsSchemaSelfHealEvenWhenThePropertyIsEnabled() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Environment environment = mock(Environment.class);
        when(environment.acceptsProfiles(Profiles.of("prod"))).thenReturn(true);

        PostgresSchemaMaintenance maintenance = new PostgresSchemaMaintenance(jdbcTemplate, dataSource, environment);
        ReflectionTestUtils.setField(maintenance, "messageTypeCheckSelfHealEnabled", true);

        maintenance.onApplicationEvent(null);

        verifyNoInteractions(jdbcTemplate, dataSource);
    }
}
