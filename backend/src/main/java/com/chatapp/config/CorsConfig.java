package com.chatapp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

@Configuration
public class CorsConfig {
    private final List<String> allowedOrigins;
    private final List<String> allowedMethods;
    private final List<String> allowedHeaders;
    private final boolean allowCredentials;
    private final boolean prodProfile;

    public CorsConfig(
            @Value("${cors.allowed-origins}") String allowedOrigins,
            @Value("${cors.allowed-methods}") String allowedMethods,
            @Value("${cors.allowed-headers}") String allowedHeaders,
            @Value("${cors.allow-credentials}") boolean allowCredentials,
            Environment environment
    ) {
        this.allowedOrigins = splitConfig(allowedOrigins);
        this.allowedMethods = splitConfig(allowedMethods);
        this.allowedHeaders = splitConfig(allowedHeaders);
        this.allowCredentials = allowCredentials;
        this.prodProfile = environment.acceptsProfiles(Profiles.of("prod"));
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        validate(allowedOrigins, allowCredentials, prodProfile);

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(allowedOrigins);
        configuration.setAllowedMethods(allowedMethods);
        configuration.setAllowedHeaders(allowedHeaders);
        configuration.setExposedHeaders(List.of("Authorization", "Content-Disposition", "Set-Cookie"));
        configuration.setAllowCredentials(allowCredentials);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    static void validate(List<String> origins, boolean allowCredentials, boolean prodProfile) {
        if (allowCredentials && origins.stream().anyMatch("*"::equals)) {
            throw new IllegalStateException(
                    "cors.allowed-origins must not contain '*' while credentials are enabled: " + origins);
        }
        if (prodProfile) {
            List<String> localOrigins = origins.stream().filter(CorsConfig::isLocalOrigin).toList();
            if (!localOrigins.isEmpty()) {
                throw new IllegalStateException(
                        "cors.allowed-origins must not contain localhost origins in the prod profile: " + localOrigins);
            }
        }
    }

    static boolean isLocalOrigin(String origin) {
        String normalized = origin.trim().toLowerCase(Locale.ROOT);
        return normalized.contains("//localhost") || normalized.contains("//127.")
                || normalized.contains("//[::1]") || normalized.contains("//0.0.0.0");
    }

    private static List<String> splitConfig(String value) {
        return Arrays.stream(value.split(","))
                .map(String::trim)
                .filter(item -> !item.isBlank())
                .toList();
    }
}
