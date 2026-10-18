package com.chatapp.repository;

import com.chatapp.model.CloudinaryUpload;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface CloudinaryUploadRepository extends JpaRepository<CloudinaryUpload, Long> {
    @Query("""
            select count(upload) from CloudinaryUpload upload
            where upload.user.id = :userId and upload.createdAt >= :since
            """)
    long countSince(@Param("userId") Long userId, @Param("since") LocalDateTime since);
}
