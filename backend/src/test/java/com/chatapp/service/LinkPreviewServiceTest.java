package com.chatapp.service;

import org.junit.jupiter.api.Test;

import java.net.URI;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LinkPreviewServiceTest {
    private final LinkPreviewService linkPreviewService = new LinkPreviewService();

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
}
