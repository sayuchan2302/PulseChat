package com.chatapp.service;

import com.chatapp.model.MediaUpload;
import com.chatapp.repository.MediaUploadRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Deletes uploads that never made it into a message or an avatar so abandoned uploads do not
 * fill the disk. The grace period keeps files around long enough for a user to finish sending
 * the message that references them.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class MediaOrphanCleanupService {
    private static final int CLEANUP_BATCH_SIZE = 200;

    private final MediaUploadRepository mediaUploadRepository;
    private final LocalMediaStorageService mediaStorageService;

    @Value("${app.uploads.orphan-grace-hours:24}")
    private long orphanGraceHours;

    @Scheduled(
            fixedDelayString = "${app.uploads.orphan-scan-delay-ms:3600000}",
            initialDelayString = "${app.uploads.orphan-scan-initial-delay-ms:600000}")
    public void removeOrphanedUploads() {
        LocalDateTime cutoff = LocalDateTime.now().minus(Duration.ofHours(orphanGraceHours));
        List<MediaUpload> orphans = mediaUploadRepository.findOrphans(
                cutoff,
                PageRequest.of(0, CLEANUP_BATCH_SIZE)
        );
        if (orphans.isEmpty()) {
            return;
        }

        int removed = 0;
        for (MediaUpload orphan : orphans) {
            if (mediaStorageService.deleteStoredMedia(orphan.getPublicId(), orphan.getFormat())) {
                mediaUploadRepository.delete(orphan);
                removed++;
            }
        }
        log.info("Removed {} orphaned media uploads", removed);
    }
}
