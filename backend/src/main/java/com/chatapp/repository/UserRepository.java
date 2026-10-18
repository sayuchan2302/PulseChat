package com.chatapp.repository;

import com.chatapp.model.User;
import com.chatapp.model.AccountRole;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByAccountRoleAndEnabledTrue(AccountRole accountRole);

    List<User> findAllByUsernameNotOrderByUsernameAsc(String username, Pageable pageable);

    List<User> findAllByUsernameContainingIgnoreCaseAndUsernameNotOrderByUsernameAsc(
            String username,
            String excludedUsername,
            Pageable pageable
    );

    List<User> findAllByUsernameIn(List<String> usernames);

    @Query("""
            select u from User u
            where :query is null or :query = ''
                or lower(u.username) like lower(concat('%', :query, '%'))
                or lower(coalesce(u.fullName, '')) like lower(concat('%', :query, '%'))
                or lower(u.email) like lower(concat('%', :query, '%'))
            """)
    Page<User> searchAccounts(@Param("query") String query, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.accountRole = :role and u.enabled = true order by u.id")
    List<User> findEnabledAccountsByRoleForUpdate(@Param("role") AccountRole role);
}
