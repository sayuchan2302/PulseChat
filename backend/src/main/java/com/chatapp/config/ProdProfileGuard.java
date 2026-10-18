package com.chatapp.config;

import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import java.util.Locale;

/**
 * Refuses to start with development defaults against a non-local database: without the prod profile
 * Flyway stays off, Hibernate runs ddl-auto=update and refresh cookies are not Secure.
 * Runs as a BeanFactoryPostProcessor so it fails before any datasource/Hibernate work happens.
 */
@Configuration(proxyBeanMethods = false)
public class ProdProfileGuard {

    @Bean
    static BeanFactoryPostProcessor requireProdProfileForRemoteDatabases() {
        return beanFactory -> {
            Environment environment = beanFactory.getBean(Environment.class);
            String datasourceUrl = environment.getProperty("spring.datasource.url", "");
            boolean prodProfileActive = environment.acceptsProfiles(Profiles.of("prod"));
            if (!prodProfileActive && !isLocalDatabase(datasourceUrl)) {
                throw new IllegalStateException("Refusing to start: spring.datasource.url points to '"
                        + datasourceUrl + "' but the 'prod' profile is not active. Dev defaults "
                        + "(ddl-auto=update, Flyway off, non-Secure cookies) must not touch a remote database. "
                        + "Set SPRING_PROFILES_ACTIVE=prod.");
            }
        };
    }

    static boolean isLocalDatabase(String datasourceUrl) {
        if (datasourceUrl == null || datasourceUrl.isBlank()) {
            return true;
        }
        String normalized = datasourceUrl.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("jdbc:h2:")) {
            return true;
        }
        return normalized.contains("//localhost") || normalized.contains("//127.")
                || normalized.contains("//[::1]") || normalized.contains("//0.0.0.0");
    }
}
