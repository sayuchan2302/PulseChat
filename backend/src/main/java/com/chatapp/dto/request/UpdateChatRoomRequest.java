package com.chatapp.dto.request;

import jakarta.validation.constraints.Size;

public record UpdateChatRoomRequest(
                @Size(min = 2, max = 100) String name,

                @Size(max = 500) String avatar) {
        public UpdateChatRoomRequest(String name) {
                this(name, null);
        }
}
