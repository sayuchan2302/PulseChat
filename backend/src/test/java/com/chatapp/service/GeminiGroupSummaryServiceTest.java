package com.chatapp.service;

import com.chatapp.model.Message;
import com.chatapp.model.User;
import com.chatapp.repository.MessageRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.net.http.HttpClient;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GeminiGroupSummaryServiceTest {
    @Test
    @SuppressWarnings("unchecked")
    void materializesTranscriptBeforeCallingGeminiOutsideTransaction() throws Exception {
        var repository = mock(MessageRepository.class);
        var rooms = mock(ChatRoomService.class);
        var transactions = mock(TransactionTemplate.class);
        var service = new GeminiGroupSummaryService(repository, rooms, new ObjectMapper(), transactions);
        var client = mock(HttpClient.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        ReflectionTestUtils.setField(service, "httpClient", client);
        ReflectionTestUtils.setField(service, "apiKey", "test-key");
        ReflectionTestUtils.setField(service, "model", "test-model");
        var inTransaction = new AtomicBoolean();
        when(transactions.execute(any())).thenAnswer(invocation -> {
            inTransaction.set(true);
            try { return ((TransactionCallback<?>) invocation.getArgument(0)).doInTransaction(null); }
            finally { inTransaction.set(false); }
        });
        var sender = new User();
        sender.setUsername("alice");
        var message = new Message();
        message.setId(10L);
        message.setSender(sender);
        message.setContent("Release on Friday");
        when(repository.findRecentSummarizableRoomMessages(eq(5L), eq(Message.MessageType.TEXT), any()))
                .thenAnswer(invocation -> { assertTrue(inTransaction.get()); return List.of(message); });
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("""
                {"candidates":[{"content":{"parts":[{"text":"Friday release"}]}}]}
                """);
        when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
            assertFalse(inTransaction.get(), "External HTTP must not hold a database transaction");
            return response;
        });
        var summary = service.summarizeLatestMessages("alice", 5L);
        assertEquals(1, summary.messageCount());
        verify(rooms, times(2)).findGroupRoomForMember("alice", 5L);
    }
}
