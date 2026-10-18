package com.chatapp.repository;

import com.chatapp.model.MediaUpload;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface MediaUploadRepository extends JpaRepository<MediaUpload, Long> {
    @Query("""
            select sum(upload.sizeBytes) from MediaUpload upload
            where upload.user.id = :userId and upload.createdAt >= :since
            """)
    Long sumSizeBytesSince(@Param("userId") Long userId, @Param("since") LocalDateTime since);

    /**
     * Uploads past the cutoff that no message references (by public id) and that no user or
     * room uses as an avatar.
     */
    @Query("""
            select upload from MediaUpload upload
            where upload.createdAt < :cutoff
              and not exists (select m from Message m where m.mediaPublicId = upload.publicId)
              and not exists (select u from User u where u.avatar like concat('%', concat(upload.publicId, '%')))
              and not exists (select r from ChatRoom r where r.avatar like concat('%', concat(upload.publicId, '%')))
            order by upload.createdAt asc
            """)
    List<MediaUpload> findOrphans(@Param("cutoff") LocalDateTime cutoff, Pageable pageable);
}
