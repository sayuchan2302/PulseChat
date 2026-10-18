package com.chatapp.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

import java.util.List;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CorsConfigTest {

    @Test
    void applicationDefaultAllowedMethodsIncludePatch() {
        YamlPropertiesFactoryBean factory = new YamlPropertiesFactoryBean();
        factory.setResources(new ClassPathResource("application.yml"));

        Properties properties = factory.getObject();

        assertNotNull(properties);
        assertTrue(properties.getProperty("cors.allowed-methods").contains("PATCH"));
    }

    @Test
    void wildcardOriginWithCredentialsIsRejected() {
        assertThrows(IllegalStateException.class, () -> CorsConfig.validate(List.of("*"), true, false));
        assertDoesNotThrow(() -> CorsConfig.validate(List.of("*"), false, false));
    }

    @Test
    void localhostOriginsAreRejectedInTheProdProfile() {
        assertThrows(IllegalStateException.class,
                () -> CorsConfig.validate(List.of("http://localhost:5173"), true, true));
        assertThrows(IllegalStateException.class,
                () -> CorsConfig.validate(List.of("http://127.0.0.1:3000"), true, true));

        assertDoesNotThrow(() -> CorsConfig.validate(List.of("http://localhost:5173"), true, false));
    }

    @Test
    void regularProdOriginsPass() {
        assertDoesNotThrow(() -> CorsConfig.validate(List.of("https://pulsechat.example.com"), true, true));
    }

    @Test
    void localOriginDetectionMatchesHostsNotSubstringsOfOtherHosts() {
        assertTrue(CorsConfig.isLocalOrigin("http://localhost:5173"));
        assertTrue(CorsConfig.isLocalOrigin("https://127.0.0.1:8443"));
        assertFalse(CorsConfig.isLocalOrigin("https://pulsechat.example.com"));
        assertFalse(CorsConfig.isLocalOrigin("https://notlocalhost.example.com"));
    }
}
