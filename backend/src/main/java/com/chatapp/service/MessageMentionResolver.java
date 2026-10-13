package com.chatapp.service;

import com.chatapp.model.ChatRoom;
import com.chatapp.model.ChatRoomMember;
import com.chatapp.model.User;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Resolves username and @all mentions against the members of a room. */
final class MessageMentionResolver {
    private static final Pattern MENTION_PATTERN = Pattern.compile("@([a-zA-Z0-9_.\\-]+)");

    private MessageMentionResolver() {
    }

    static Set<User> resolve(ChatRoom room, User sender, String content) {
        if (room == null || content == null || !content.contains("@") || room.getMembers() == null) {
            return Collections.emptySet();
        }

        Set<User> eligibleMembers = room.getMembers().stream()
                .map(ChatRoomMember::getUser)
                .filter(user -> user != null && !user.getId().equals(sender.getId()))
                .collect(Collectors.toSet());
        if (eligibleMembers.isEmpty()) {
            return Collections.emptySet();
        }

        Matcher matcher = MENTION_PATTERN.matcher(content);
        Set<String> matchedTokens = new HashSet<>();
        while (matcher.find()) {
            matchedTokens.add(matcher.group(1).toLowerCase());
        }
        if (matchedTokens.contains("all")) {
            return eligibleMembers;
        }

        return eligibleMembers.stream()
                .filter(user -> user.getUsername() != null && matchedTokens.contains(user.getUsername().toLowerCase()))
                .collect(Collectors.toSet());
    }
}
