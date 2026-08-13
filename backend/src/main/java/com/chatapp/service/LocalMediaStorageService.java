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
    private static final long MAX_AUDIO_SIZE_BYTES = 20L * 1024 * 1024;
    private static final long MAX_FILE_SIZE_BYTES = 50L * 1024 * 1024;
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
            Map.entry("video/x-matroska", "mkv"),
            Map.entry("audio/webm", "webm"),
            Map.entry("audio/mpeg", "mp3"),
            Map.entry("audio/mp3", "mp3"),
            Map.entry("audio/mp4", "mp4"),
            Map.entry("audio/ogg", "ogg"),
            Map.entry("audio/wav", "wav"),
            Map.entry("audio/x-wav", "wav"),
            Map.entry("application/pdf", "pdf"),
            Map.entry("application/zip", "zip"),
            Map.entry("application/x-zip-compressed", "zip"),
            Map.entry("application/msword", "doc"),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
            Map.entry("application/vnd.ms-excel", "xls"),
            Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
            Map.entry("application/vnd.ms-powerpoint", "ppt"),
            Map.entry("application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"),
            Map.entry("text/plain", "txt"),
            Map.entry("text/csv", "csv"),
            Map.entry("application/json", "json"));

    @Value("${app.uploads.media-dir:uploads/media}")
    private String mediaDirectory;

    @Value("${server.servlet.context-path:}")
    private String contextPath;

    public LocalMediaUploadResponse storeMedia(MultipartFile mediaFile) {
        if (mediaFile == null || mediaFile.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        String contentType = mediaFile.getContentType();
        boolean isImage = contentType != null && contentType.startsWith("image/");
        boolean isVideo = contentType != null && contentType.startsWith("video/");
        boolean isAudio = contentType != null && contentType.startsWith("audio/");

        validateFileSize(mediaFile, isImage, isVideo, isAudio);

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
        // Image uses "image", Video and Audio use "video", generic files/documents use
        // "raw"
        String resourceType = isImage ? "image" : (isVideo || isAudio ? "video" : "raw");

        return new LocalMediaUploadResponse(
                url,
                publicId,
                resourceType,
                format,
                mediaFile.getSize());
    }

    private void validateFileSize(MultipartFile file, boolean isImage, boolean isVideo, boolean isAudio) {
        long maxSize;
        if (isVideo) {
            maxSize = MAX_VIDEO_SIZE_BYTES;
        } else if (isAudio) {
            maxSize = MAX_AUDIO_SIZE_BYTES;
        } else if (isImage) {
            maxSize = MAX_IMAGE_SIZE_BYTES;
        } else {
            maxSize = MAX_FILE_SIZE_BYTES;
        }
        if (file.getSize() > maxSize) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }
    }

    private String determineFormat(MultipartFile file, String contentType) {
        String originalName = file.getOriginalFilename();
        if (StringUtils.hasText(originalName) && originalName.contains(".")) {
            return originalName.substring(originalName.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        }

        if (StringUtils.hasText(contentType)) {
            String ext = EXTENSIONS_BY_CONTENT_TYPE.get(contentType.toLowerCase(Locale.ROOT));
            if (ext != null) {
                return ext;
            }
            if (contentType.startsWith("video/"))
                return "mp4";
            if (contentType.startsWith("audio/"))
                return "webm";
            if (contentType.startsWith("image/"))
                return "png";
        }

        return "bin";
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
