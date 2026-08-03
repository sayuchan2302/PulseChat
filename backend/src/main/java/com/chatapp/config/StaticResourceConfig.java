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

    @Value("${app.uploads.media-dir:uploads/media}")
    private String mediaDirectory;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/avatars/**")
                .addResourceLocations(toDirectoryResourceLocation(avatarDirectory));

        registry.addResourceHandler("/uploads/media/**")
                .addResourceLocations(toDirectoryResourceLocation(mediaDirectory));
    }

    private String toDirectoryResourceLocation(String directory) {
        Path path = Paths.get(directory).toAbsolutePath().normalize();
        String location = path.toUri().toString();
        return location.endsWith("/") ? location : location + "/";
    }
}
