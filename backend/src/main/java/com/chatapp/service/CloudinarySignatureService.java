package com.chatapp.service;

import com.chatapp.dto.response.CloudinaryUploadSignatureResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import com.chatapp.model.CloudinaryUpload;
import com.chatapp.model.User;
import com.chatapp.repository.CloudinaryUploadRepository;
import com.chatapp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CloudinarySignatureService {
    private static final String RESOURCE_TYPE = "auto";
    private static final String UPLOAD_URL_TEMPLATE = "https://api.cloudinary.com/v1_1/%s/%s/upload";
    /**
     * Mirrors the formats accepted by local storage: images, videos, audio, documents and
     * archives. HTML, SVG and other scriptable files are intentionally absent so Cloudinary
     * rejects them at upload time.
     */
    private static final String DEFAULT_ALLOWED_FORMATS =
            "jpg,png,webp,gif,mp4,webm,mov,avi,mkv,mp3,ogg,wav,pdf,zip,doc,docx,xls,xlsx,ppt,pptx,txt,csv,json";

    private final UserRepository userRepository;
    private final CloudinaryUploadRepository cloudinaryUploadRepository;

    @Value("${cloudinary.cloud-name:}")
    private String cloudName;

    @Value("${cloudinary.api-key:}")
    private String apiKey;

    @Value("${cloudinary.api-secret:}")
    private String apiSecret;

    @Value("${cloudinary.upload-folder:chat-app/messages}")
    private String uploadFolder;

    @Value("${cloudinary.allowed-formats:" + DEFAULT_ALLOWED_FORMATS + "}")
    private String allowedFormats;

    @Value("${cloudinary.daily-signature-quota:100}")
    private long dailySignatureQuota;

    @Value("${cloudinary.public-uploads-enabled:false}")
    private boolean publicUploadsEnabled;

    /**
     * Issues a signature that pins the destination public id, the allowed formats and the
     * timestamp. The client must send every signed parameter back to Cloudinary unchanged,
     * otherwise the upload is rejected, so the signature itself cannot be extended or reused
     * for another file type or path.
     */
    @Transactional
    public CloudinaryUploadSignatureResponse createUploadSignature(String username) {
        if (!publicUploadsEnabled) {
            throw new AppException(ErrorCode.CLOUDINARY_PUBLIC_UPLOAD_DISABLED);
        }
        validateConfiguration();

        User user = userRepository
                .findByUsername(username)
                .orElseThrow(() -> new AppException(ErrorCode.UNAUTHORIZED));
        enforceDailyQuota(user);

        long timestamp = Instant.now().getEpochSecond();
        String publicId = UUID.randomUUID().toString();
        String signature = sha1(
                "allowed_formats=" + allowedFormats
                        + "&folder=" + uploadFolder
                        + "&public_id=" + publicId
                        + "&timestamp=" + timestamp
                        + apiSecret);

        recordSignatureIssued(user, publicId);

        return new CloudinaryUploadSignatureResponse(
                cloudName,
                apiKey,
                timestamp,
                signature,
                uploadFolder,
                publicId,
                allowedFormats,
                RESOURCE_TYPE,
                UPLOAD_URL_TEMPLATE.formatted(cloudName, RESOURCE_TYPE)
        );
    }

    private void enforceDailyQuota(User user) {
        long issuedToday = cloudinaryUploadRepository.countSince(user.getId(), LocalDateTime.now().minusDays(1));
        if (issuedToday >= dailySignatureQuota) {
            throw new AppException(ErrorCode.MEDIA_QUOTA_EXCEEDED);
        }
    }

    private void recordSignatureIssued(User user, String publicId) {
        CloudinaryUpload upload = new CloudinaryUpload();
        upload.setUser(user);
        upload.setPublicId(publicId);
        cloudinaryUploadRepository.save(upload);
    }

    private void validateConfiguration() {
        if (
                !StringUtils.hasText(cloudName)
                        || !StringUtils.hasText(apiKey)
                        || !StringUtils.hasText(apiSecret)
                        || !StringUtils.hasText(uploadFolder)
                        || !StringUtils.hasText(allowedFormats)
        ) {
            throw new AppException(ErrorCode.CLOUDINARY_CONFIG_MISSING);
        }
    }

    private String sha1(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new AppException(ErrorCode.INTERNAL_ERROR);
        }
    }
}
