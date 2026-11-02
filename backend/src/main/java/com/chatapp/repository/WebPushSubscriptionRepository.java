package com.chatapp.repository;

import com.chatapp.model.WebPushSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface WebPushSubscriptionRepository extends JpaRepository<WebPushSubscription, Long> {
    List<WebPushSubscription> findByUserId(Long userId);

    @Query("select s from WebPushSubscription s where s.user.username = :username")
    List<WebPushSubscription> findByUsername(@Param("username") String username);

    Optional<WebPushSubscription> findByEndpoint(String endpoint);

    @Modifying
    @Query("delete from WebPushSubscription s where s.endpoint = :endpoint")
    int deleteByEndpoint(@Param("endpoint") String endpoint);

    @Modifying
    @Query("delete from WebPushSubscription s where s.user.id = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}

