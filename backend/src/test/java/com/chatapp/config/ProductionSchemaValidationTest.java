package com.chatapp.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:production_schema_validation;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "jwt.secret=01234567890123456789012345678901"
})
@ActiveProfiles("prod")
class ProductionSchemaValidationTest {
    @Test
    void flywaySchemaValidatesAgainstHibernateMappings() {
        // Starting the production profile runs Flyway before Hibernate's validate phase.
    }
}
