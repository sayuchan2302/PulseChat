package com.chatapp.service;

import com.chatapp.dto.response.CloudinaryUploadSignatureResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class CloudinarySignatureService {
    private static final String RESOURCE_TYPE = "auto";
    private static final String UPLOAD_URL_TEMPLATE = "https://api.cloudinary.com/v1_1/%s/%s/upload";

    @Value("${cloudinary.cloud-name:}")
    private String cloudName;

    @Value("${cloudinary.api-key:}")
    private String apiKey;

    @Value("${cloudinary.api-secret:}")
    private String apiSecret;

    @Value("${cloudinary.upload-folder:chat-app/messages}")
    private String uploadFolder;

    public CloudinaryUploadSignatureResponse createUploadSignature() {
        validateConfiguration();

        long timestamp = Instant.now().getEpochSecond();
        String signature = sha1("folder=" + uploadFolder + "&timestamp=" + timestamp + apiSecret);

        return new CloudinaryUploadSignatureResponse(
                cloudName,
                apiKey,
                timestamp,
                signature,
                uploadFolder,
                RESOURCE_TYPE,
                UPLOAD_URL_TEMPLATE.formatted(cloudName, RESOURCE_TYPE)
        );
    }

    private void validateConfiguration() {
        if (
                !StringUtils.hasText(cloudName)
                        || !StringUtils.hasText(apiKey)
                        || !StringUtils.hasText(apiSecret)
                        || !StringUtils.hasText(uploadFolder)
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
