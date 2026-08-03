package com.chatapp.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
public class StaticResourceConfig implements WebMvcConfigurer {
    @Value("${app.uploads.avatar-dir:uploads/avatars}")
    private String avatarDirectory;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path avatarPath = Paths.get(avatarDirectory).toAbsolutePath().normalize();
        registry.addResourceHandler("/uploads/avatars/**")
                .addResourceLocations(avatarPath.toUri().toString());
    }
}
