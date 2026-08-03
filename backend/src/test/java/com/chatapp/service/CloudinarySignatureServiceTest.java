package com.chatapp.service;

import com.chatapp.dto.response.CloudinaryUploadSignatureResponse;
import com.chatapp.exception.AppException;
import com.chatapp.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CloudinarySignatureServiceTest {
    @Test
    void createUploadSignatureReturnsSignedCloudinaryParams() {
        CloudinarySignatureService service = service("demo", "api-key", "secret", "chat/messages");

        CloudinaryUploadSignatureResponse response = service.createUploadSignature();

        assertEquals("demo", response.cloudName());
        assertEquals("api-key", response.apiKey());
        assertEquals("chat/messages", response.folder());
        assertEquals("auto", response.resourceType());
        assertEquals("https://api.cloudinary.com/v1_1/demo/auto/upload", response.uploadUrl());
        assertNotNull(response.signature());
        assertEquals(40, response.signature().length());
        assertTrue(response.timestamp() > 0);
    }

    @Test
    void createUploadSignatureRequiresCloudinaryConfiguration() {
        CloudinarySignatureService service = service("", "api-key", "secret", "chat/messages");

        AppException exception = assertThrows(AppException.class, service::createUploadSignature);

        assertEquals(ErrorCode.CLOUDINARY_CONFIG_MISSING, exception.getErrorCode());
    }

    private static CloudinarySignatureService service(
            String cloudName,
            String apiKey,
            String apiSecret,
            String uploadFolder
    ) {
        CloudinarySignatureService service = new CloudinarySignatureService();
        ReflectionTestUtils.setField(service, "cloudName", cloudName);
        ReflectionTestUtils.setField(service, "apiKey", apiKey);
        ReflectionTestUtils.setField(service, "apiSecret", apiSecret);
        ReflectionTestUtils.setField(service, "uploadFolder", uploadFolder);
        return service;
    }
}
