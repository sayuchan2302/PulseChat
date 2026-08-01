package com.chatapp.repository;

import com.chatapp.model.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    @Query("""
            select m from Message m
            where (m.sender.id = :currentUserId and m.receiver.id = :otherUserId)
               or (m.sender.id = :otherUserId and m.receiver.id = :currentUserId)
            order by m.timestamp asc
            """)
    List<Message> findConversation(
            @Param("currentUserId") Long currentUserId,
            @Param("otherUserId") Long otherUserId
    );
}
