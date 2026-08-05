package com.chatapp.service;

import com.chatapp.dto.request.CallSignalRequest.CallSignalType;
import com.chatapp.dto.response.CallSignalResponse;
import com.chatapp.dto.response.MessageResponse;
import com.chatapp.dto.response.UserResponse;
import com.chatapp.model.CallSession;
import com.chatapp.model.CallSession.CallStatus;
import com.chatapp.repository.CallSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class CallSessionMaintenanceService {
    private final CallSessionRepository callSessionRepository;
    private final MessageService messageService;
    private final CallRealtimeNotifier callRealtimeNotifier;

    @Value("${chat.calls.ringing-timeout-seconds:45}")
    private long ringingTimeoutSeconds;

    @Scheduled(fixedDelayString = "${chat.calls.missed-scan-delay-ms:10000}")
    @Transactional
    public void markTimedOutRingingCallsAsMissed() {
        LocalDateTime cutoff = LocalDateTime.now().minusSeconds(ringingTimeoutSeconds);
        callSessionRepository.findByStatusAndCreatedAtBefore(CallStatus.RINGING, cutoff)
                .forEach(this::markMissed);
    }

    private void markMissed(CallSession callSession) {
        if (callSession.getStatus() != CallStatus.RINGING) {
            return;
        }

        callSession.setStatus(CallStatus.MISSED);
        callSession.setEndedAt(LocalDateTime.now());
        CallSession savedCallSession = callSessionRepository.saveAndFlush(callSession);
        MessageResponse historyMessage = messageService.saveCallHistoryMessage(
                savedCallSession,
                savedCallSession.getCaller()
        );

        CallSignalResponse response = CallSignalResponse.from(
                savedCallSession,
                CallSignalType.CALL_MISSED,
                UserResponse.from(savedCallSession.getCaller()),
                null,
                null,
                null,
                null,
                historyMessage
        );
        callRealtimeNotifier.notifyParticipants(response);
    }
}
