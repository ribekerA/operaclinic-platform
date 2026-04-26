import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

interface RequestWithRequestId extends Request {
  requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithRequestId>();
    const response = context.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.resolveMessage(exception);

    if (!(exception instanceof HttpException) || statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception ${request.method} ${request.originalUrl} requestId=${request.requestId ?? "unknown"}`,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      message,
      path: request.originalUrl,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private resolveMessage(exception: unknown): string | string[] {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === "string") {
        return response;
      }

      if (
        response &&
        typeof response === "object" &&
        "message" in response
      ) {
        const maybeMessage = (response as { message?: string | string[] }).message;

        if (Array.isArray(maybeMessage) || typeof maybeMessage === "string") {
          return maybeMessage;
        }
      }

      return exception.message;
    }

    return "Internal server error";
  }
}
