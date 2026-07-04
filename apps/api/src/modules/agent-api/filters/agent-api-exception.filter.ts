import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgentApiException, AgentErrorCode } from '../agent-api.errors';

@Catch()
export class AgentApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AgentApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof AgentApiException) {
      const body: Record<string, unknown> = {
        error_code: exception.errorCode,
        message: exception.message,
      };
      if (exception.details !== undefined) {
        body.details = exception.details;
      }
      response.status(exception.statusCode).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const rawMessage =
        typeof res === 'string'
          ? res
          : Array.isArray((res as { message?: unknown }).message)
            ? ((res as { message: string[] }).message).join('; ')
            : String((res as { message?: string }).message ?? res);

      const errorCode =
        status === 409
          ? AgentErrorCode.SLOT_TAKEN
          : status === 404
            ? AgentErrorCode.APPOINTMENT_NOT_FOUND
            : status === 401 || status === 403
              ? AgentErrorCode.UNAUTHORIZED
              : AgentErrorCode.VALIDATION_ERROR;

      response.status(status).json({ error_code: errorCode, message: rawMessage });
      return;
    }

    this.logger.error('Unhandled exception in agent-api', exception instanceof Error ? exception.stack : String(exception));
    response.status(500).json({
      error_code: AgentErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    });
  }
}
