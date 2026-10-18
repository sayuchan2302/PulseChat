package com.chatapp.service;

import com.chatapp.dto.response.LocalMediaUploadResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.MediaUpload;
import com.chatapp.model.User;
import com.chatapp.repository.MediaUploadRepository;
import com.chatapp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.core.io.Resource;
import org.springframework.core.io.PathResource;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@Slf4j
@RequiredArgsConstructor
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

    private static final Map<String, Set<String>> DETECTED_TYPE_ALIASES = Map.ofEntries(
            Map.entry("image/jpg", Set.of("image/jpeg")),
            Map.entry("audio/mp3", Set.of("audio/mpeg")),
            Map.entry("audio/x-wav", Set.of("audio/wav")),
            Map.entry("application/x-zip-compressed", Set.of("application/zip")),
            Map.entry("application/vnd.openxmlformats-officedocument.wordprocessingml.document", Set.of("application/zip")),
            Map.entry("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Set.of("application/zip")),
            Map.entry("application/vnd.openxmlformats-officedocument.presentationml.presentation", Set.of("application/zip")),
            Map.entry("video/x-msvideo", Set.of("video/avi")),
            Map.entry("text/csv", Set.of("text/plain", "application/csv")),
            Map.entry("audio/webm", Set.of("video/webm")),
            Map.entry("audio/mp4", Set.of("video/mp4")));

    private static final Tika CONTENT_DETECTOR = new Tika();

    private final UserRepository userRepository;
    private final MediaUploadRepository mediaUploadRepository;

    @Value("${app.uploads.media-dir:uploads/media}")
    private String mediaDirectory;

    @Value("${server.servlet.context-path:}")
    private String contextPath;

    @Value("${app.uploads.daily-quota-bytes:262144000}")
    private long dailyQuotaBytes;

    public LocalMediaUploadResponse storeMedia(MultipartFile file, String username) {
        if (!StringUtils.hasText(username)) throw new AppException(ErrorCode.UNAUTHORIZED);
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHORIZED));
        enforceDailyQuota(user);

        LocalMediaUploadResponse result = storeMedia(file);
        Path ownersDirectory = Paths.get(mediaDirectory).toAbsolutePath().normalize().resolve(".owners");
        try {
            Files.createDirectories(ownersDirectory);
            Files.writeString(ownersDirectory.resolve(result.publicId()), username);
        } catch (IOException exception) {
            throw new AppException(ErrorCode.MEDIA_UPLOAD_FAILED);
        }

        recordUpload(user, result);
        return result;
    }

    /**
     * Deletes a stored upload and its ownership marker. Returns false when the files cannot be
     * removed right now; the cleanup job will retry on its next run.
     */
    public boolean deleteStoredMedia(String publicId, String format) {
        Path storageDirectory = Paths.get(mediaDirectory).toAbsolutePath().normalize();
        try {
            Files.deleteIfExists(storageDirectory.resolve(publicId + "." + format));
            Files.deleteIfExists(storageDirectory.resolve(".owners").resolve(publicId));
            return true;
        } catch (IOException exception) {
            log.warn("Unable to delete stored media {}", publicId, exception);
            return false;
        }
    }

    public String getOwner(String filename) {
        validateFilename(filename);
        Path owner = Paths.get(mediaDirectory).toAbsolutePath().normalize().resolve(".owners")
                .resolve(filename.substring(0, filename.lastIndexOf('.')));
        try {
            return Files.isRegularFile(owner) ? Files.readString(owner) : null;
        } catch (IOException exception) {
            throw new AppException(ErrorCode.FORBIDDEN);
        }
    }

    public Resource loadMedia(String filename) {
        validateFilename(filename);
        try {
            Path root = Paths.get(mediaDirectory).toRealPath();
            Path file = root.resolve(filename).toRealPath();
            if (!file.startsWith(root) || !Files.isRegularFile(file)) {
                throw new AppException(ErrorCode.FORBIDDEN);
            }
            return new PathResource(file);
        } catch (IOException exception) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
        }
    }

    public void validateFilename(String filename) {
        if (filename == null || !filename.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.[a-z0-9]+")) {
            throw new AppException(ErrorCode.FORBIDDEN);
        }
    }

    LocalMediaUploadResponse storeMedia(MultipartFile mediaFile) {
        if (mediaFile == null || mediaFile.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        String contentType = mediaFile.getContentType();
        boolean isImage = contentType != null && contentType.startsWith("image/");
        boolean isVideo = contentType != null && contentType.startsWith("video/");
        boolean isAudio = contentType != null && contentType.startsWith("audio/");

        validateFileSize(mediaFile, isImage, isVideo, isAudio);

        String format = determineFormat(contentType);
        validateFileContent(mediaFile, contentType);
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

    /**
     * Rolling 24-hour byte quota per user. Checked before the file is written; it is a soft
     * limit, so a user just under the quota may still overshoot by one file.
     */
    private void enforceDailyQuota(User user) {
        Long usedBytes = mediaUploadRepository.sumSizeBytesSince(
                user.getId(),
                LocalDateTime.now().minusDays(1)
        );
        if (usedBytes != null && usedBytes >= dailyQuotaBytes) {
            throw new AppException(ErrorCode.MEDIA_QUOTA_EXCEEDED);
        }
    }

    private void recordUpload(User user, LocalMediaUploadResponse result) {
        MediaUpload upload = new MediaUpload();
        upload.setUser(user);
        upload.setPublicId(result.publicId());
        upload.setFormat(result.format());
        upload.setSizeBytes(result.bytes());
        mediaUploadRepository.save(upload);
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

    private String determineFormat(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        String format = EXTENSIONS_BY_CONTENT_TYPE.get(contentType.toLowerCase(Locale.ROOT));
        if (format == null) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        return format;
    }

    private void validateFileContent(MultipartFile file, String declaredContentType) {
        final String detectedContentType;
        try (InputStream inputStream = file.getInputStream()) {
            detectedContentType = CONTENT_DETECTOR.detect(inputStream).toLowerCase(Locale.ROOT);
        } catch (IOException exception) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
        }

        String declared = declaredContentType.toLowerCase(Locale.ROOT).split(";", 2)[0].trim();
        if (declared.equals(detectedContentType)) {
            return;
        }

        boolean compatible = DETECTED_TYPE_ALIASES
                .getOrDefault(declared, Set.of())
                .contains(detectedContentType);
        if ("text/plain".equals(declared) && "application/json".equals(detectedContentType)) {
            compatible = true;
        }

        if (!compatible) {
            throw new AppException(ErrorCode.INVALID_MEDIA_FILE);
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
