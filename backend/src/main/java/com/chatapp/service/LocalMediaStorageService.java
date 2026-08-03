package com.chatapp.service;

import com.chatapp.dto.response.LocalMediaUploadResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
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
import java.util.UUID;

@Service
public class LocalMediaStorageService {
    private static final long MAX_IMAGE_SIZE_BYTES = 10L * 1024 * 1024;
    private static final long MAX_VIDEO_SIZE_BYTES = 50L * 1024 * 1024;
    private static final String PUBLIC_MEDIA_PATH = "/uploads/media";

    private static final Map<String, String> EXTENSIONS_BY_CONTENT_TYPE = Map.ofEntries(
            Map.entry("image/jpeg", "jpg"),
            Map.entry("image/jpg", "jpg"),
            Map.entry("image/png", "png"),
            Map.entry("image/webp", "webp"),
            Map.entry("image/gif", "gif"),
            Map.entry("video/mp4", "mp4"),
            Map.entry("video/webm", "webm"),
            Map.entry("video/quicktime", "mov"),
            Map.entry("video/x-msvideo", "avi"),
            Map.entry("video/x-matroska", "mkv"));

    @Value("${app.uploads.media-dir:uploads/media}")
    private String mediaDirectory;

    @Value("${server.servlet.context-path:}")
    private String contextPath;

    public LocalMediaUploadResponse storeMedia(MultipartFile mediaFile) {
        if (mediaFile == null || mediaFile.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        String contentType = mediaFile.getContentType();
        if (!StringUtils.hasText(contentType)) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        boolean isImage = contentType.startsWith("image/");
        boolean isVideo = contentType.startsWith("video/");
        if (!isImage && !isVideo) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        validateFileSize(mediaFile, isVideo);

        String format = determineFormat(mediaFile, contentType);
        String publicId = UUID.randomUUID().toString();
        String filename = publicId + "." + format;

        Path storageDirectory = Paths.get(mediaDirectory).toAbsolutePath().normalize();
        Path targetPath = storageDirectory.resolve(filename).normalize();

        try {
            Files.createDirectories(storageDirectory);
            try (InputStream inputStream = mediaFile.getInputStream()) {
                Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw new AppException(ErrorCode.MEDIA_UPLOAD_FAILED);
        }

        String url = normalizedContextPath() + PUBLIC_MEDIA_PATH + "/" + filename;
        String resourceType = isVideo ? "video" : "image";

        return new LocalMediaUploadResponse(
                url,
                publicId,
                resourceType,
                format,
                mediaFile.getSize());
    }

    private void validateFileSize(MultipartFile file, boolean isVideo) {
        long maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
        if (file.getSize() > maxSize) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }
    }

    private String determineFormat(MultipartFile file, String contentType) {
        String ext = EXTENSIONS_BY_CONTENT_TYPE.get(contentType.toLowerCase(Locale.ROOT));
        if (ext != null) {
            return ext;
        }

        String originalName = file.getOriginalFilename();
        if (StringUtils.hasText(originalName) && originalName.contains(".")) {
            return originalName.substring(originalName.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        }

        return contentType.startsWith("video/") ? "mp4" : "png";
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
