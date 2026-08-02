package com.chatapp.controller;

import com.chatapp.dto.request.CreateFriendRequest;
import com.chatapp.dto.response.FriendshipResponse;
import com.chatapp.dto.response.FriendshipSummaryResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.service.FriendshipService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class FriendshipController {
    private static final String FRIEND_REQUEST_QUEUE = "/queue/friend-requests";

    private final FriendshipService friendshipService;
    private final SimpMessagingTemplate messagingTemplate;

    @GetMapping("/friends")
    public List<UserResponse> listFriends(Authentication authentication) {
        return friendshipService.listFriends(authentication.getName());
    }

    @GetMapping("/friends/search")
    public List<UserResponse> searchUsers(
            Authentication authentication,
            @RequestParam(required = false) String username
    ) {
        return friendshipService.searchUsers(authentication.getName(), username);
    }

    @GetMapping("/friend-requests/incoming")
    public List<FriendshipResponse> listIncomingRequests(Authentication authentication) {
        return friendshipService.listIncomingRequests(authentication.getName());
    }

    @GetMapping("/friend-requests/outgoing")
    public List<FriendshipResponse> listOutgoingRequests(Authentication authentication) {
        return friendshipService.listOutgoingRequests(authentication.getName());
    }

    @GetMapping("/friend-requests/summary")
    public FriendshipSummaryResponse getSummary(Authentication authentication) {
        return friendshipService.getSummary(authentication.getName());
    }

    @PostMapping("/friend-requests")
    public ResponseEntity<FriendshipResponse> sendRequest(
            Authentication authentication,
            @Valid @RequestBody CreateFriendRequest request
    ) {
        FriendshipResponse response = friendshipService.sendRequest(authentication.getName(), request);
        notifyParticipants(response);

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PatchMapping("/friend-requests/{requestId}/accept")
    public FriendshipResponse acceptRequest(
            Authentication authentication,
            @PathVariable Long requestId
    ) {
        FriendshipResponse response = friendshipService.acceptRequest(authentication.getName(), requestId);
        notifyParticipants(response);

        return response;
    }

    @PatchMapping("/friend-requests/{requestId}/decline")
    public FriendshipResponse declineRequest(
            Authentication authentication,
            @PathVariable Long requestId
    ) {
        FriendshipResponse response = friendshipService.declineRequest(authentication.getName(), requestId);
        notifyParticipants(response);

        return response;
    }

    @DeleteMapping("/friend-requests/{requestId}")
    public ResponseEntity<Void> cancelRequest(
            Authentication authentication,
            @PathVariable Long requestId
    ) {
        FriendshipResponse response = friendshipService.cancelRequest(authentication.getName(), requestId);
        notifyParticipants(response);

        return ResponseEntity.noContent().build();
    }

    private void notifyParticipants(FriendshipResponse response) {
        notifyUser(response.requester().username(), response);
        notifyUser(response.receiver().username(), response);
    }

    private void notifyUser(String username, FriendshipResponse response) {
        messagingTemplate.convertAndSendToUser(username, FRIEND_REQUEST_QUEUE, response);
    }
}
