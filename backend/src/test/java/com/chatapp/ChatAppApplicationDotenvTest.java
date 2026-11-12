package com.chatapp;

import me.paulschwarz.springdotenv.DotenvPropertySource;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ChatAppApplicationDotenvTest {

    @Test
    void registerBackendDotenvFallbackIsSafeToInvokeAndKeepsStandardPropertySourcesIntact() {
        StandardEnvironment environment = new StandardEnvironment();

        ChatAppApplication.registerBackendDotenvFallback(environment);

        assertTrue(environment.getPropertySources().contains(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME));
        if (!Files.isRegularFile(Path.of(".env")) && Files.isRegularFile(Path.of("backend", ".env"))) {
            PropertySource<?> dotenvSource = environment.getPropertySources()
                    .get(DotenvPropertySource.DOTENV_PROPERTY_SOURCE_NAME);
            assertNotNull(dotenvSource);
            assertNotNull(environment.getProperty("JWT_SECRET"));
        }
    }
}
