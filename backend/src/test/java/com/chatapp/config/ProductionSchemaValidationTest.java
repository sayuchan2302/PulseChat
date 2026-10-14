package com.chatapp.config;

import com.chatapp.security.JwtService;
import com.chatapp.security.RefreshTokenCookieService;
import com.chatapp.service.AuthService;
import com.chatapp.service.RefreshTokenService;
import com.chatapp.dto.request.LoginRequest;
import com.chatapp.dto.request.RegisterRequest;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;

import java.nio.charset.StandardCharsets;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:production_schema_validation;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "jwt.secret=01234567890123456789012345678901"
})
@ActiveProfiles("prod")
class ProductionSchemaValidationTest {
    private static final String TEST_JWT_SECRET = "01234567890123456789012345678901";

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RefreshTokenService refreshTokenService;

    @Autowired
    private RefreshTokenCookieService refreshTokenCookieService;

    @Autowired
    private AuthService authService;

    @Test
    void flywaySchemaValidatesAgainstHibernateMappings() {
        // Starting the production profile runs Flyway before Hibernate's validate phase.
    }

    @Test
    void configuredAccessAndRefreshLifetimesAreFifteenMinutesAndFourteenDays() {
        String jwt = jwtService.generateAccessToken("lifetime-test");
        Claims claims = Jwts.parser()
                .verifyWith(Keys.hmacShaKeyFor(TEST_JWT_SECRET.getBytes(StandardCharsets.UTF_8)))
                .build()
                .parseSignedClaims(jwt)
                .getPayload();

        Assertions.assertEquals(900_000L, claims.getExpiration().getTime() - claims.getIssuedAt().getTime());
        Assertions.assertEquals(
                1_209_600_000L,
                ((Number) org.springframework.test.util.ReflectionTestUtils
                        .getField(refreshTokenService, "refreshExpirationMs")).longValue()
        );

        MockHttpServletResponse response = new MockHttpServletResponse();
        refreshTokenCookieService.addRefreshToken(response, "test-refresh-token");
        Assertions.assertTrue(response.getHeader("Set-Cookie").contains("Max-Age=1209600"));
    }

    @Test
    void registeredUserCanLogInAndRotateRefreshToken() {
        AuthService.AuthResult registered = authService.register(new RegisterRequest(
                "Lifetime Test User",
                "lifetime-test-user",
                "lifetime-test-user@example.com",
                "valid-test-password"
        ));

        AuthService.AuthResult loggedIn = authService.login(new LoginRequest(
                "lifetime-test-user",
                "valid-test-password"
        ));
        AuthService.AuthResult refreshed = authService.refresh(loggedIn.refreshToken());

        Assertions.assertEquals("lifetime-test-user", jwtService.extractUsername(loggedIn.response().token()));
        Assertions.assertEquals("lifetime-test-user", jwtService.extractUsername(refreshed.response().token()));
        Assertions.assertNotEquals(registered.refreshToken(), loggedIn.refreshToken());
        Assertions.assertNotEquals(loggedIn.refreshToken(), refreshed.refreshToken());
    }
}
