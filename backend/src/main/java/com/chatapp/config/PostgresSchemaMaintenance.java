package com.chatapp.config;

import com.chatapp.model.Message.MessageType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class PostgresSchemaMaintenance implements ApplicationListener<ContextRefreshedEvent>, Ordered {
    private static final String MESSAGE_TYPE_CONSTRAINT = "messages_type_check";

    private final JdbcTemplate jdbcTemplate;
    private final DataSource dataSource;
    private final AtomicBoolean applied = new AtomicBoolean(false);

    @Value("${app.schema.self-heal-message-type-check:true}")
    private boolean messageTypeCheckSelfHealEnabled;

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        if (!messageTypeCheckSelfHealEnabled || !applied.compareAndSet(false, true)) {
            return;
        }

        if (!isPostgres()) {
            return;
        }

        reconcileMessageTypeCheckConstraint();
    }

    private boolean isPostgres() {
        try (Connection connection = dataSource.getConnection()) {
            String productName = connection.getMetaData().getDatabaseProductName();
            return productName != null && productName.toLowerCase(Locale.ROOT).contains("postgresql");
        } catch (SQLException exception) {
            log.warn("Unable to inspect database type for schema maintenance", exception);
            return false;
        }
    }

    private void reconcileMessageTypeCheckConstraint() {
        try {
            jdbcTemplate.execute("alter table messages drop constraint if exists " + MESSAGE_TYPE_CONSTRAINT);
            jdbcTemplate.execute(messageTypeCheckConstraintSql());
            log.info("Reconciled messages.type check constraint with current MessageType enum values");
        } catch (RuntimeException exception) {
            log.warn("Unable to reconcile messages.type check constraint", exception);
        }
    }

    static String messageTypeCheckConstraintSql() {
        String allowedTypes = Arrays.stream(MessageType.values())
                .map(MessageType::name)
                .map(value -> "'" + value.replace("'", "''") + "'")
                .collect(Collectors.joining(", "));

        return "alter table messages add constraint " + MESSAGE_TYPE_CONSTRAINT +
                " check (type is null or type in (" + allowedTypes + "))";
    }
}
