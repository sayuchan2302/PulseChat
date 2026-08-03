package com.chatapp.controller;

import com.chatapp.dto.response.CloudinaryUploadSignatureResponse;
import com.chatapp.dto.response.LocalMediaUploadResponse;
import com.chatapp.service.CloudinarySignatureService;
import com.chatapp.service.LocalMediaStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/media")
@RequiredArgsConstructor
public class MediaController {
    private final CloudinarySignatureService cloudinarySignatureService;
    private final LocalMediaStorageService localMediaStorageService;

    @PostMapping("/upload-signature")
    public CloudinaryUploadSignatureResponse createUploadSignature() {
        return cloudinarySignatureService.createUploadSignature();
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public LocalMediaUploadResponse uploadMedia(@RequestParam("file") MultipartFile file) {
        return localMediaStorageService.storeMedia(file);
    }
}
