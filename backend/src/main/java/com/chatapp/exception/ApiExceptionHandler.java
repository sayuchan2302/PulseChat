package com.chatapp.exception;

import com.chatapp.dto.response.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.stream.Stream;

@Slf4j
@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(AppException.class)
    public ResponseEntity<ErrorResponse> handleAppException(
            AppException exception,
            HttpServletRequest request
    ) {
        ErrorCode errorCode = exception.getErrorCode();
        return buildResponse(
                errorCode.getStatus(),
                errorCode.getCode(),
                exception.getMessage(),
                request
        );
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatusException(
            ResponseStatusException exception,
            HttpServletRequest request
    ) {
        String message = exception.getReason() == null ? "Request failed" : exception.getReason();
        return buildResponse(
                exception.getStatusCode(),
                "HTTP_" + exception.getStatusCode().value(),
                message,
                request
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        List<ErrorResponse.FieldError> fieldErrors = Stream.concat(
                        exception.getBindingResult().getFieldErrors().stream()
                                .map(error -> new ErrorResponse.FieldError(
                                        error.getField(),
                                        defaultMessage(error.getDefaultMessage())
                                )),
                        exception.getBindingResult().getGlobalErrors().stream()
                                .map(error -> new ErrorResponse.FieldError(
                                        error.getObjectName(),
                                        defaultMessage(error.getDefaultMessage())
                                ))
                )
                .toList();

        return buildResponse(
                ErrorCode.VALIDATION_FAILED.getStatus(),
                ErrorCode.VALIDATION_FAILED.getCode(),
                ErrorCode.VALIDATION_FAILED.getDefaultMessage(),
                request,
                fieldErrors
        );
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolationException(
            ConstraintViolationException exception,
            HttpServletRequest request
    ) {
        List<ErrorResponse.FieldError> fieldErrors = exception.getConstraintViolations()
                .stream()
                .map(violation -> new ErrorResponse.FieldError(
                        violation.getPropertyPath().toString(),
                        defaultMessage(violation.getMessage())
                ))
                .toList();

        return buildResponse(
                ErrorCode.VALIDATION_FAILED.getStatus(),
                ErrorCode.VALIDATION_FAILED.getCode(),
                ErrorCode.VALIDATION_FAILED.getDefaultMessage(),
                request,
                fieldErrors
        );
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<ErrorResponse> handleMalformedRequest(
            Exception exception,
            HttpServletRequest request
    ) {
        return buildResponse(
                ErrorCode.MALFORMED_REQUEST.getStatus(),
                ErrorCode.MALFORMED_REQUEST.getCode(),
                malformedRequestMessage(exception),
                request
        );
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolationException(
            DataIntegrityViolationException exception,
            HttpServletRequest request
    ) {
        return buildResponse(
                ErrorCode.DATA_INTEGRITY_VIOLATION.getStatus(),
                ErrorCode.DATA_INTEGRITY_VIOLATION.getCode(),
                ErrorCode.DATA_INTEGRITY_VIOLATION.getDefaultMessage(),
                request
        );
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ErrorResponse> handleAuthenticationException(
            AuthenticationException exception,
            HttpServletRequest request
    ) {
        return buildResponse(
                ErrorCode.UNAUTHORIZED.getStatus(),
                ErrorCode.UNAUTHORIZED.getCode(),
                ErrorCode.UNAUTHORIZED.getDefaultMessage(),
                request
        );
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDeniedException(
            AccessDeniedException exception,
            HttpServletRequest request
    ) {
        return buildResponse(
                ErrorCode.FORBIDDEN.getStatus(),
                ErrorCode.FORBIDDEN.getCode(),
                ErrorCode.FORBIDDEN.getDefaultMessage(),
                request
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpectedException(
            Exception exception,
            HttpServletRequest request
    ) {
        String requestId = ErrorResponseFactory.requestId(request);
        log.error("Unhandled exception. requestId={}", requestId, exception);

        return buildResponse(
                ErrorCode.INTERNAL_ERROR.getStatus(),
                ErrorCode.INTERNAL_ERROR.getCode(),
                ErrorCode.INTERNAL_ERROR.getDefaultMessage(),
                request,
                requestId
        );
    }

    private ResponseEntity<ErrorResponse> buildResponse(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request
    ) {
        return buildResponse(status, code, message, request, List.of());
    }

    private ResponseEntity<ErrorResponse> buildResponse(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request,
            List<ErrorResponse.FieldError> fieldErrors
    ) {
        return buildResponse(status, code, message, request, ErrorResponseFactory.requestId(request), fieldErrors);
    }

    private ResponseEntity<ErrorResponse> buildResponse(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request,
            String requestId
    ) {
        return buildResponse(status, code, message, request, requestId, List.of());
    }

    private ResponseEntity<ErrorResponse> buildResponse(
            HttpStatusCode status,
            String code,
            String message,
            HttpServletRequest request,
            String requestId,
            List<ErrorResponse.FieldError> fieldErrors
    ) {
        ErrorResponse errorResponse = ErrorResponseFactory.create(
                status,
                code,
                message,
                request,
                requestId,
                fieldErrors
        );

        return ResponseEntity.status(status).body(errorResponse);
    }

    private String defaultMessage(String message) {
        return StringUtils.hasText(message) ? message : "Invalid value";
    }

    private String malformedRequestMessage(Exception exception) {
        if (exception instanceof MissingServletRequestParameterException missingParameterException) {
            return "Missing required parameter: " + missingParameterException.getParameterName();
        }

        if (exception instanceof MethodArgumentTypeMismatchException typeMismatchException) {
            return "Invalid value for parameter: " + typeMismatchException.getName();
        }

        return ErrorCode.MALFORMED_REQUEST.getDefaultMessage();
    }
}
