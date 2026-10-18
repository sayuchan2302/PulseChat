package com.chatapp.service;

import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.core5.http.io.HttpClientResponseHandler;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LinkPreviewServiceTest {
    private final LinkPreviewService linkPreviewService = new LinkPreviewService();

    private static CloseableHttpClient failingHttpClient() throws IOException {
        CloseableHttpClient httpClient = mock(CloseableHttpClient.class);
        when(httpClient.execute(any(HttpGet.class), any(HttpClientResponseHandler.class)))
                .thenThrow(new IOException("network down"));
        return httpClient;
    }

    private static void burnCircuitBreaker(LinkPreviewService service) {
        for (int attempt = 0; attempt < LinkPreviewService.CIRCUIT_BREAKER_FAILURE_THRESHOLD; attempt++) {
            assertNull(service.resolveFirstPreview("see https://8.8.8.8/article"));
        }
    }

    @Test
    void buildPreviewExtractsOpenGraphMetadata() {
        String html = """
                <html>
                  <head>
                    <meta property="og:title" content="Example &amp; Article">
                    <meta property="og:description" content="Short article description">
                    <meta property="og:image" content="/cover.png">
                  </head>
                </html>
                """;

        LinkPreviewMetadata preview = linkPreviewService.buildPreview(
                URI.create("https://8.8.8.8/articles/one"),
                html
        );

        assertEquals("https://8.8.8.8/articles/one", preview.url());
        assertEquals("Example & Article", preview.title());
        assertEquals("Short article description", preview.description());
        assertEquals("https://8.8.8.8/cover.png", preview.imageUrl());
        assertEquals("8.8.8.8", preview.domain());
    }

    @Test
    void findFirstExternalUriRejectsLocalhostAndPrivateAddresses() {
        assertTrue(linkPreviewService.findFirstExternalUri("http://localhost:8080/test").isEmpty());
        assertTrue(linkPreviewService.findFirstExternalUri("http://127.0.0.1/test").isEmpty());
        assertTrue(linkPreviewService.findFirstExternalUri("http://192.168.1.5/test").isEmpty());
    }

    @Test
    void buildPreviewReturnsNullWhenPageHasNoMetadata() {
        LinkPreviewMetadata preview = linkPreviewService.buildPreview(
                URI.create("https://8.8.8.8/plain"),
                "<html><body>No metadata</body></html>"
        );

        assertNull(preview);
    }

    @Test
    void opensTheCircuitAfterConsecutiveFetchFailures() throws IOException {
        CloseableHttpClient httpClient = failingHttpClient();
        LinkPreviewService service = new LinkPreviewService(httpClient, System::nanoTime);

        burnCircuitBreaker(service);

        assertTrue(service.isCircuitOpen());

        assertNull(service.resolveFirstPreview("see https://8.8.8.8/another"));

        verify(httpClient, times(LinkPreviewService.CIRCUIT_BREAKER_FAILURE_THRESHOLD))
                .execute(any(HttpGet.class), any(HttpClientResponseHandler.class));
    }

    @Test
    void aFailedProbeAfterTheCooldownReopensTheCircuit() throws IOException {
        CloseableHttpClient httpClient = failingHttpClient();
        AtomicLong clock = new AtomicLong();
        LinkPreviewService service = new LinkPreviewService(httpClient, clock::get);

        burnCircuitBreaker(service);
        assertTrue(service.isCircuitOpen());

        clock.addAndGet(Duration.ofSeconds(31).toNanos());
        assertFalse(service.isCircuitOpen());

        assertNull(service.resolveFirstPreview("see https://8.8.8.8/another"));

        assertTrue(service.isCircuitOpen());
        verify(httpClient, times(LinkPreviewService.CIRCUIT_BREAKER_FAILURE_THRESHOLD + 1))
                .execute(any(HttpGet.class), any(HttpClientResponseHandler.class));
    }

    @Test
    void aSuccessfulFetchResetsTheFailureStreak() throws IOException {
        CloseableHttpClient httpClient = mock(CloseableHttpClient.class);
        when(httpClient.execute(any(HttpGet.class), any(HttpClientResponseHandler.class)))
                .thenThrow(new IOException("network down"))
                .thenThrow(new IOException("network down"))
                .thenThrow(new IOException("network down"))
                .thenThrow(new IOException("network down"))
                .thenReturn(null)
                .thenThrow(new IOException("network down"));
        LinkPreviewService service = new LinkPreviewService(httpClient, System::nanoTime);

        for (int attempt = 0; attempt < LinkPreviewService.CIRCUIT_BREAKER_FAILURE_THRESHOLD + 1; attempt++) {
            assertNull(service.resolveFirstPreview("see https://8.8.8.8/article"));
        }

        assertFalse(service.isCircuitOpen());
    }
}
