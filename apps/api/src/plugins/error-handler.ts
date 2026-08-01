import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ApiErrorCodeSchema,
  ApiErrorSchema,
  type ApiError,
  type ApiErrorCode,
} from "@continuity/contracts";

const DEFAULT_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  AGENT_FAILURE: 503,
  DATABASE_FAILURE: 503,
  INTERNAL_ERROR: 500,
};

const DEFAULT_RETRYABLE_BY_CODE: Record<ApiErrorCode, boolean> = {
  VALIDATION_ERROR: false,
  NOT_FOUND: false,
  CONFLICT: false,
  INVALID_STATE_TRANSITION: false,
  IDEMPOTENCY_KEY_REQUIRED: false,
  IDEMPOTENCY_KEY_REUSED: false,
  AGENT_FAILURE: true,
  DATABASE_FAILURE: true,
  INTERNAL_ERROR: false,
};

export class ApiHttpError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details: ApiError["details"];

  constructor(
    code: ApiErrorCode,
    message: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      details?: ApiError["details"];
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiHttpError";
    this.code = code;
    this.statusCode = options.statusCode ?? DEFAULT_STATUS_BY_CODE[code];
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE_BY_CODE[code];
    this.details = options.details;
  }
}

type ValidationIssue = {
  instancePath?: unknown;
  keyword?: unknown;
  message?: unknown;
  params?: unknown;
};

function pathFromValidationIssue(issue: ValidationIssue): Array<string | number> {
  const instancePath = typeof issue.instancePath === "string" ? issue.instancePath : "";
  const path = instancePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));

  if (issue.keyword === "required" && typeof issue.params === "object" && issue.params !== null) {
    const missingProperty = (issue.params as { missingProperty?: unknown }).missingProperty;
    if (typeof missingProperty === "string") {
      path.push(missingProperty);
    }
  }

  return path;
}

function validationDetails(error: FastifyError): ApiError["details"] | undefined {
  if (!Array.isArray(error.validation)) {
    return undefined;
  }

  const fields = error.validation.map((rawIssue) => {
    const issue = rawIssue as ValidationIssue;
    return {
      path: pathFromValidationIssue(issue),
      message: typeof issue.message === "string" ? issue.message : "Request value is invalid.",
    };
  });

  return fields.length > 0 ? { fields } : undefined;
}

function zodValidationDetails(error: FastifyError): ApiError["details"] | undefined {
  const issues = (error as FastifyError & { issues?: unknown }).issues;
  if (error.name !== "ZodError" || !Array.isArray(issues)) return undefined;
  const fields = issues.flatMap((issue) => {
    if (typeof issue !== "object" || issue === null) return [];
    const candidate = issue as { path?: unknown; message?: unknown };
    return [{
      path: Array.isArray(candidate.path)
        ? candidate.path.filter((part): part is string | number =>
          typeof part === "string" || typeof part === "number")
        : [],
      message: typeof candidate.message === "string"
        ? candidate.message
        : "Request value is invalid.",
    }];
  });
  return fields.length > 0 ? { fields } : undefined;
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return ApiErrorCodeSchema.safeParse(value).success;
}

function buildApiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  options: {
    statusCode?: number;
    retryable?: boolean;
    details?: ApiError["details"];
  } = {},
): { statusCode: number; body: ApiError } {
  const body: ApiError = {
    code,
    message,
    requestId,
    details: options.details,
    retryable: options.retryable ?? DEFAULT_RETRYABLE_BY_CODE[code],
  };

  const parsed = ApiErrorSchema.safeParse(body);
  if (!parsed.success) {
    return {
      statusCode: 500,
      body: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
        requestId,
        retryable: false,
      },
    };
  }

  return {
    statusCode: options.statusCode ?? DEFAULT_STATUS_BY_CODE[code],
    body: parsed.data,
  };
}

export function normalizeFastifyError(
  error: FastifyError,
  requestId: string,
): { statusCode: number; body: ApiError } {
  if (error instanceof ApiHttpError) {
    return buildApiError(error.code, error.message, requestId, {
      statusCode: error.statusCode,
      retryable: error.retryable,
      details: error.details,
    });
  }

  if (error.validation) {
    return buildApiError("VALIDATION_ERROR", "Request validation failed.", requestId, {
      statusCode: error.statusCode ?? 400,
      details: validationDetails(error),
    });
  }

  if (error.name === "ZodError") {
    return buildApiError("VALIDATION_ERROR", "Request validation failed.", requestId, {
      details: zodValidationDetails(error),
    });
  }

  if (isApiErrorCode(error.code)) {
    return buildApiError(error.code, error.message, requestId, {
      statusCode: error.statusCode,
    });
  }

  if (error.statusCode === 404 || error.code === "FST_ERR_NOT_FOUND") {
    return buildApiError("NOT_FOUND", "The requested resource was not found.", requestId);
  }

  if (error.statusCode === 409) {
    return buildApiError("CONFLICT", "The request conflicts with the current resource state.", requestId);
  }

  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    return buildApiError("VALIDATION_ERROR", "The request could not be processed.", requestId, {
      statusCode: error.statusCode,
    });
  }

  return buildApiError("INTERNAL_ERROR", "Internal server error.", requestId);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (reply.sent) {
      return;
    }

    const normalized = normalizeFastifyError(error, request.id);
    reply.status(normalized.statusCode).send(normalized.body);
  });

  app.setNotFoundHandler((request, reply) => {
    const normalized = buildApiError(
      "NOT_FOUND",
      "The requested resource was not found.",
      request.id,
    );
    reply.status(normalized.statusCode).send(normalized.body);
  });
}
