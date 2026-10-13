package com.chatapp.service;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.util.Timeout;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.io.InputStream;
import java.net.IDN;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class LinkPreviewService {
    private static final int MAX_HTML_BYTES = 256 * 1024;
    private static final int MAX_URL_LENGTH = 2048;
    private static final int MAX_TITLE_LENGTH = 255;
    private static final int MAX_DESCRIPTION_LENGTH = 500;
    private static final int MAX_DOMAIN_LENGTH = 255;
    private static final Duration CONNECT_TIMEOUT = Duration.ofMillis(1200);
    private static final Duration REQUEST_TIMEOUT = Duration.ofMillis(2200);
    private static final Pattern URL_PATTERN = Pattern.compile("https?://[^\\s<>'\"`]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern META_TAG_PATTERN = Pattern.compile("<meta\\s+[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE_TAG_PATTERN = Pattern.compile(
            "<title[^>]*>(.*?)</title>",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );
    private static final Pattern TAG_PATTERN = Pattern.compile("<[^>]+>");
    private static final Map<String, String> HTML_ENTITIES = Map.of(
            "&amp;", "&",
            "&lt;", "<",
            "&gt;", ">",
            "&quot;", "\"",
            "&#39;", "'"
    );

    private final CloseableHttpClient httpClient;
    private final ThreadPoolExecutor previewExecutor = new ThreadPoolExecutor(
            4,
            4,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(16),
            runnable -> {
                Thread thread = new Thread(runnable, "link-preview-fetch");
                thread.setDaemon(true);
                return thread;
            },
            new ThreadPoolExecutor.AbortPolicy());

    public LinkPreviewService() {
        this(createHttpClient());
    }

    LinkPreviewService(CloseableHttpClient httpClient) {
        this.httpClient = httpClient;
    }

    private static CloseableHttpClient createHttpClient() {
        PoolingHttpClientConnectionManager connectionManager = PoolingHttpClientConnectionManagerBuilder.create()
                .setDnsResolver(new PublicOnlyDnsResolver())
                .setDefaultConnectionConfig(ConnectionConfig.custom()
                        .setConnectTimeout(Timeout.ofMilliseconds(CONNECT_TIMEOUT.toMillis()))
                        .build())
                .build();
        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectionRequestTimeout(Timeout.ofMilliseconds(CONNECT_TIMEOUT.toMillis()))
                .setResponseTimeout(Timeout.ofMilliseconds(REQUEST_TIMEOUT.toMillis()))
                .setRedirectsEnabled(false)
                .build();

        return HttpClients.custom()
                .setConnectionManager(connectionManager)
                .setDefaultRequestConfig(requestConfig)
                .disableRedirectHandling()
                .disableCookieManagement()
                .disableAuthCaching()
                .build();
    }

    @PreDestroy
    void closeHttpClient() throws IOException {
        previewExecutor.shutdownNow();
        httpClient.close();
    }

    public LinkPreviewMetadata resolveFirstPreview(String content) {
        return findFirstExternalUri(content)
                .map(this::fetchPreview)
                .orElse(null);
    }

    Optional<URI> findFirstExternalUri(String content) {
        if (!StringUtils.hasText(content)) {
            return Optional.empty();
        }

        Matcher matcher = URL_PATTERN.matcher(content);
        while (matcher.find()) {
            Optional<URI> uri = toExternalUri(stripTrailingPunctuation(matcher.group()));
            if (uri.isPresent()) {
                return uri;
            }
        }

        return Optional.empty();
    }

    LinkPreviewMetadata buildPreview(URI uri, String html) {
        if (!StringUtils.hasText(html)) {
            return null;
        }

        Map<String, String> meta = extractMetaTags(html);
        String title = firstText(
                meta.get("og:title"),
                meta.get("twitter:title"),
                extractTitle(html)
        );
        String description = firstText(
                meta.get("og:description"),
                meta.get("description"),
                meta.get("twitter:description")
        );
        String imageUrl = firstText(meta.get("og:image"), meta.get("twitter:image"));
        String resolvedImageUrl = resolvePreviewImageUrl(uri, imageUrl);

        if (!StringUtils.hasText(title) && !StringUtils.hasText(description) && !StringUtils.hasText(resolvedImageUrl)) {
            return null;
        }

        return new LinkPreviewMetadata(
                truncate(uri.toString(), MAX_URL_LENGTH),
                truncate(title, MAX_TITLE_LENGTH),
                truncate(description, MAX_DESCRIPTION_LENGTH),
                truncate(resolvedImageUrl, MAX_URL_LENGTH),
                truncate(displayDomain(uri), MAX_DOMAIN_LENGTH)
        );
    }

    private LinkPreviewMetadata fetchPreview(URI uri) {
        HttpGet request = new HttpGet(uri);
        request.setHeader("User-Agent", "ChatAppLinkPreview/1.0");
        request.setHeader("Accept", "text/html,application/xhtml+xml");

        final Future<LinkPreviewMetadata> fetch;
        try {
            fetch = previewExecutor.submit(() -> executePreviewRequest(uri, request));
        } catch (RejectedExecutionException exception) {
            log.debug("Link preview queue is full for {}", uri);
            return null;
        }

        try {
            return fetch.get(REQUEST_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            request.cancel();
            fetch.cancel(true);
            previewExecutor.remove((Runnable) fetch);
            log.debug("Link preview timed out for {}", uri);
            return null;
        } catch (InterruptedException exception) {
            request.cancel();
            fetch.cancel(true);
            previewExecutor.remove((Runnable) fetch);
            Thread.currentThread().interrupt();
            return null;
        } catch (ExecutionException exception) {
            log.debug("Unable to resolve link preview for {}", uri, exception.getCause());
            return null;
        }
    }

    private LinkPreviewMetadata executePreviewRequest(URI uri, HttpGet request) throws IOException {
        return httpClient.execute(request, response -> {
            int status = response.getCode();
            HttpEntity entity = response.getEntity();
            if (status < 200 || status >= 300 || entity == null || !isHtmlResponse(entity)) {
                return null;
            }

            try (InputStream body = entity.getContent()) {
                return buildPreview(uri, readLimitedHtml(body));
            }
        });
    }

    private boolean isHtmlResponse(HttpEntity entity) {
        String contentType = entity.getContentType();
        contentType = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);

        return contentType.isBlank()
                || contentType.startsWith("text/html")
                || contentType.startsWith("application/xhtml+xml");
    }

    private String readLimitedHtml(InputStream body) throws IOException {
        byte[] bytes = body.readNBytes(MAX_HTML_BYTES + 1);
        int length = Math.min(bytes.length, MAX_HTML_BYTES);
        return new String(bytes, 0, length, StandardCharsets.UTF_8);
    }

    private Map<String, String> extractMetaTags(String html) {
        return META_TAG_PATTERN.matcher(html)
                .results()
                .map(match -> match.group(0))
                .map(this::extractMetaTag)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .collect(java.util.stream.Collectors.toMap(
                        MetaTag::key,
                        MetaTag::content,
                        (first, second) -> first
                ));
    }

    private Optional<MetaTag> extractMetaTag(String tag) {
        String key = extractAttribute(tag, "property")
                .or(() -> extractAttribute(tag, "name"))
                .map(value -> value.toLowerCase(Locale.ROOT))
                .orElse("");
        String content = extractAttribute(tag, "content").orElse("");

        if (!StringUtils.hasText(key) || !StringUtils.hasText(content)) {
            return Optional.empty();
        }

        return Optional.of(new MetaTag(key, cleanText(content, MAX_DESCRIPTION_LENGTH)));
    }

    private Optional<String> extractAttribute(String tag, String attributeName) {
        Pattern pattern = Pattern.compile(
                "\\b" + Pattern.quote(attributeName) + "\\s*=\\s*([\"'])(.*?)\\1",
                Pattern.CASE_INSENSITIVE | Pattern.DOTALL
        );
        Matcher matcher = pattern.matcher(tag);
        return matcher.find() ? Optional.of(matcher.group(2)) : Optional.empty();
    }

    private String extractTitle(String html) {
        Matcher matcher = TITLE_TAG_PATTERN.matcher(html);
        return matcher.find() ? cleanText(matcher.group(1), MAX_TITLE_LENGTH) : null;
    }

    private String resolvePreviewImageUrl(URI baseUri, String imageUrl) {
        if (!StringUtils.hasText(imageUrl)) {
            return null;
        }

        try {
            URI resolvedUri = baseUri.resolve(imageUrl.trim());
            return toExternalUri(resolvedUri.toString())
                    .map(URI::toString)
                    .orElse(null);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private Optional<URI> toExternalUri(String rawUrl) {
        if (!StringUtils.hasText(rawUrl)) {
            return Optional.empty();
        }

        try {
            URI uri = new URI(rawUrl.trim()).normalize();
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (
                    scheme == null
                            || host == null
                            || uri.getUserInfo() != null
                            || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))
            ) {
                return Optional.empty();
            }

            String asciiHost = IDN.toASCII(host).toLowerCase(Locale.ROOT);
            if (isBlockedHost(asciiHost)) {
                return Optional.empty();
            }

            return Optional.of(uri);
        } catch (IllegalArgumentException | URISyntaxException exception) {
            return Optional.empty();
        }
    }

    private boolean isBlockedHost(String host) {
        if ("localhost".equals(host) || host.endsWith(".localhost")) {
            return true;
        }

        try {
            new PublicOnlyDnsResolver().resolve(host);
            return false;
        } catch (UnknownHostException exception) {
            return true;
        }
    }

    private String stripTrailingPunctuation(String rawUrl) {
        String url = rawUrl.trim();
        while (!url.isEmpty() && ".,!?;:)]}".indexOf(url.charAt(url.length() - 1)) >= 0) {
            url = url.substring(0, url.length() - 1);
        }

        return url;
    }

    private String firstText(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }

        return null;
    }

    private String cleanText(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return null;
        }

        String decoded = decodeHtmlEntities(TAG_PATTERN.matcher(value).replaceAll(" "));
        return truncate(decoded.replaceAll("\\s+", " ").trim(), maxLength);
    }

    private String decodeHtmlEntities(String value) {
        String decoded = value;
        for (Map.Entry<String, String> entity : HTML_ENTITIES.entrySet()) {
            decoded = decoded.replace(entity.getKey(), entity.getValue());
        }

        return decoded;
    }

    private String truncate(String value, int maxLength) {
        if (!StringUtils.hasText(value)) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }

    private String displayDomain(URI uri) {
        String host = uri.getHost();
        return host == null ? null : host.replaceFirst("^www\\.", "");
    }

    private record MetaTag(String key, String content) {
    }
}
