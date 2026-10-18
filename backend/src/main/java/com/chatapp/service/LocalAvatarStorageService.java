package com.chatapp.service;

import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class LocalAvatarStorageService {
    private static final long MAX_AVATAR_SIZE_BYTES = 2L * 1024 * 1024;
    private static final String PUBLIC_AVATAR_PATH = "/uploads/avatars";
    private static final Map<String, String> EXTENSIONS_BY_CONTENT_TYPE = Map.of(
            "image/jpeg", ".jpg",
            "image/jpg", ".jpg",
            "image/png", ".png",
            "image/webp", ".webp",
            "image/gif", ".gif"
    );
    private static final Map<String, Set<String>> DETECTED_TYPE_ALIASES = Map.of(
            "image/jpg", Set.of("image/jpeg")
    );
    private static final Tika CONTENT_DETECTOR = new Tika();

    @Value("${app.uploads.avatar-dir:uploads/avatars}")
    private String avatarDirectory;

    @Value("${server.servlet.context-path:}")
    private String contextPath;

    public String storeAvatar(MultipartFile avatarFile) {
        if (avatarFile == null || avatarFile.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_AVATAR_FILE);
        }

        validateFileSize(avatarFile);
        String contentType = avatarFile.getContentType();
        String extension = extensionFor(contentType);
        validateFileContent(avatarFile, contentType);
        String filename = UUID.randomUUID() + extension;
        Path storageDirectory = Paths.get(avatarDirectory).toAbsolutePath().normalize();
        Path targetPath = storageDirectory.resolve(filename).normalize();

        try {
            Files.createDirectories(storageDirectory);
            try (InputStream inputStream = avatarFile.getInputStream()) {
                Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw new AppException(ErrorCode.AVATAR_UPLOAD_FAILED);
        }

        return normalizedContextPath() + PUBLIC_AVATAR_PATH + "/" + filename;
    }

    private void validateFileSize(MultipartFile avatarFile) {
        if (avatarFile.getSize() > MAX_AVATAR_SIZE_BYTES) {
            throw new AppException(ErrorCode.INVALID_AVATAR_FILE);
        }
    }

    private String extensionFor(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            throw new AppException(ErrorCode.INVALID_AVATAR_FILE);
        }

        String extension = EXTENSIONS_BY_CONTENT_TYPE.get(contentType.toLowerCase(Locale.ROOT));
        if (extension == null) {
            throw new AppException(ErrorCode.INVALID_AVATAR_FILE);
        }

        return extension;
    }

    /**
     * Trust the bytes, not the declared content type: avatars are served from the same origin
     * as the app, so a mislabeled HTML/SVG payload must never be stored.
     */
    private void validateFileContent(MultipartFile file, String declaredContentType) {
        final String detectedContentType;
        try (InputStream inputStream = file.getInputStream()) {
            detectedContentType = CONTENT_DETECTOR.detect(inputStream).toLowerCase(Locale.ROOT);
        } catch (IOException exception) {
            throw new AppException(ErrorCode.INVALID_AVATAR_FILE);
        }

        String declared = declaredContentType.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
        if (declared.equals(detectedContentType)) {
            return;
        }

        boolean compatible = DETECTED_TYPE_ALIASES
                .getOrDefault(declared, Set.of())
                .contains(detectedContentType);
        if (!compatible) {
            throw new AppException(ErrorCode.INVALID_AVATAR_FILE);
        }
    }

    private String normalizedContextPath() {
        if (!StringUtils.hasText(contextPath) || "/".equals(contextPath.trim())) {
            return "";
        }

        String normalized = contextPath.trim();
        if (!normalized.startsWith("/")) {
            normalized = "/" + normalized;
        }

        return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
    }
}
