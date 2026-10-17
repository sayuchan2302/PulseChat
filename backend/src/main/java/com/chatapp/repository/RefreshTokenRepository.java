package com.chatapp.repository;

import com.chatapp.model.RefreshToken;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Modifying
    @Query("update RefreshToken token set token.revokedAt = CURRENT_TIMESTAMP where token.user.id = :userId and token.revokedAt is null")
    int revokeAllActiveByUserId(@Param("userId") Long userId);
}
