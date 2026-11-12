package com.chatapp;

import me.paulschwarz.springdotenv.DotenvConfig;
import me.paulschwarz.springdotenv.DotenvPropertySource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

@SpringBootApplication
@EnableScheduling
@EnableAsync
public class ChatAppApplication {
    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(ChatAppApplication.class);
        application.addListeners(
                (ApplicationListener<ApplicationEnvironmentPreparedEvent>) event ->
                        registerBackendDotenvFallback(event.getEnvironment())
        );
        application.run(args);
    }

    static void registerBackendDotenvFallback(ConfigurableEnvironment environment) {
        if (Files.isRegularFile(Path.of(".env")) || !Files.isRegularFile(Path.of("backend", ".env"))) {
            return;
        }
        Properties properties = new Properties();
        properties.setProperty("directory", "backend");
        properties.setProperty("ignoreIfMissing", "true");
        DotenvPropertySource fallbackSource = new DotenvPropertySource(new DotenvConfig(properties));
        MutablePropertySources propertySources = environment.getPropertySources();
        if (propertySources.contains(DotenvPropertySource.DOTENV_PROPERTY_SOURCE_NAME)) {
            propertySources.replace(DotenvPropertySource.DOTENV_PROPERTY_SOURCE_NAME, fallbackSource);
        } else if (propertySources.contains(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME)) {
            propertySources.addAfter(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, fallbackSource);
        } else {
            propertySources.addLast(fallbackSource);
        }
    }
}
