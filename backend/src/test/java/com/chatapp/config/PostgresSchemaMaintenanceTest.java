package com.chatapp.config;

import com.chatapp.model.Message.MessageType;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PostgresSchemaMaintenanceTest {

    @Test
    void messageTypeConstraintIncludesEveryMessageType() {
        String sql = PostgresSchemaMaintenance.messageTypeCheckConstraintSql();

        assertTrue(sql.contains("messages_type_check"));
        for (MessageType type : MessageType.values()) {
            assertTrue(sql.contains("'" + type.name() + "'"));
        }
    }
}
