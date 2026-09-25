import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Base class for all expected/handled application errors. Anything thrown
 * as an AppError (or subclass) is safe to surface to the end user via
 * `message`. Never put database connection strings, stack traces, or
 * secrets into `message`.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 400, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  readonly details?: Record<string, string[]>;
  constructor(message = "The information provided is invalid.", details?: Record<string, string[]>) {
    super(message, 422, "VALIDATION_ERROR");
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource could not be found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "This record already exists.") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * Converts any thrown value into a safe, user-friendly JSON API response.
 * Use this in every Route Handler's catch block:
 *
 *   try { ... } catch (err) { return handleApiError(err); }
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "form";
      details[key] = [...(details[key] || []), issue.message];
    }
    return NextResponse.json(
      { error: { message: "The information provided is invalid.", code: "VALIDATION_ERROR", details } },
      { status: 422 }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          message: error.message,
          code: error.code,
          ...(error instanceof ValidationError && error.details
            ? { details: error.details }
            : {}),
        },
      },
      { status: error.statusCode }
    );
  }

  // Mongoose duplicate key error
  if (typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000) {
    return NextResponse.json(
      { error: { message: "A record with these details already exists.", code: "CONFLICT" } },
      { status: 409 }
    );
  }

  // Unknown/unexpected error — never leak internal details.
  console.error("[Unhandled API error]", error);
  return NextResponse.json(
    {
      error: {
        message: "Something went wrong on our end. Please try again shortly.",
        code: "INTERNAL_SERVER_ERROR",
      },
    },
    { status: 500 }
  );
}
