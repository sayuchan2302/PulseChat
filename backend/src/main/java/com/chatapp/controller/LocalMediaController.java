package com.chatapp.controller;

import com.chatapp.service.LocalMediaStorageService;
import com.chatapp.service.MediaAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class LocalMediaController {
    private final MediaAccessService mediaAccessService;
    private final LocalMediaStorageService storage;

    @GetMapping("/uploads/media/{filename}")
    public ResponseEntity<Resource> download(@PathVariable String filename, Authentication authentication) {
        mediaAccessService.requireAccess(authentication.getName(), filename);
        Resource resource = storage.loadMedia(filename);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .contentType(MediaTypeFactory.getMediaType(filename).orElse(MediaType.APPLICATION_OCTET_STREAM))
                .body(resource);
    }
}
