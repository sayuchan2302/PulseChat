package com.chatapp.repository;

import com.chatapp.model.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, Long> {
    interface UnreadCountProjection {
        Long getUserId();

        long getUnreadCount();
    }

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

    @Query("""
            select m from Message m
            join fetch m.sender
            left join fetch m.receiver
            where m.id in (
                select max(latest.id)
                from Message latest
                where latest.chatRoom is null
                  and (
                      (latest.sender.id = :currentUserId and latest.receiver.id in :friendIds)
                      or (latest.receiver.id = :currentUserId and latest.sender.id in :friendIds)
                  )
                group by case
                    when latest.sender.id = :currentUserId then latest.receiver.id
                    else latest.sender.id
                end
            )
            """)
    List<Message> findLatestMessagesForPrivateConversations(
            @Param("currentUserId") Long currentUserId,
            @Param("friendIds") List<Long> friendIds
    );

    @Query("""
            select m.sender.id as userId, count(m) as unreadCount
            from Message m
            where m.receiver.id = :receiverId
              and m.read = false
            group by m.sender.id
            """)
    List<UnreadCountProjection> countUnreadMessagesGroupedBySender(@Param("receiverId") Long receiverId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update Message m
            set m.read = true
            where m.sender.id = :senderId
              and m.receiver.id = :receiverId
              and m.read = false
            """)
    int markConversationAsRead(
            @Param("senderId") Long senderId,
            @Param("receiverId") Long receiverId
    );

    Optional<Message> findBySenderIdAndClientId(Long senderId, String clientId);

    List<Message> findByChatRoomIdOrderByTimestampAsc(Long chatRoomId);
}
