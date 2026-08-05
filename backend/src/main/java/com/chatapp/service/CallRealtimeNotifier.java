package com.chatapp.service;

import com.chatapp.dto.response.CallSignalResponse;
import com.chatapp.dto.response.CallSignalResponse.CallRecipientRole;
import com.chatapp.dto.response.MessageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CallRealtimeNotifier {
    private static final String CALL_QUEUE = "/queue/calls";
    private static final String PRIVATE_MESSAGE_QUEUE = "/queue/messages";

    private final SimpMessagingTemplate messagingTemplate;

    public void notifyParticipants(CallSignalResponse response) {
        notifyCaller(response);
        notifyReceiver(response);
        notifyHistoryMessage(response);
    }

    public void notifyCallerOnly(CallSignalResponse response) {
        notifyCaller(response);
        notifyHistoryMessage(response);
    }

    private void notifyCaller(CallSignalResponse response) {
        messagingTemplate.convertAndSendToUser(
                response.caller().username(),
                CALL_QUEUE,
                response.forRecipient(CallRecipientRole.CALLER)
        );
    }

    private void notifyReceiver(CallSignalResponse response) {
        messagingTemplate.convertAndSendToUser(
                response.receiver().username(),
                CALL_QUEUE,
                response.forRecipient(CallRecipientRole.RECEIVER)
        );
    }

    private void notifyHistoryMessage(CallSignalResponse response) {
        MessageResponse historyMessage = response.historyMessage();
        if (historyMessage == null) {
            return;
        }

        messagingTemplate.convertAndSendToUser(
                response.caller().username(),
                PRIVATE_MESSAGE_QUEUE,
                historyMessage
        );
        messagingTemplate.convertAndSendToUser(
                response.receiver().username(),
                PRIVATE_MESSAGE_QUEUE,
                historyMessage
        );
    }
}
