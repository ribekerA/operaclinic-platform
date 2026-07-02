export const AgentErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  SLOT_TAKEN: 'SLOT_TAKEN',
  SLOT_NOT_FOUND: 'SLOT_NOT_FOUND',
  APPOINTMENT_NOT_FOUND: 'APPOINTMENT_NOT_FOUND',
  APPOINTMENT_NOT_CANCELLABLE: 'APPOINTMENT_NOT_CANCELLABLE',
  APPOINTMENT_NOT_RESCHEDULABLE: 'APPOINTMENT_NOT_RESCHEDULABLE',
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  PROFESSIONAL_NOT_FOUND: 'PROFESSIONAL_NOT_FOUND',
  SERVICE_NOT_FOUND: 'SERVICE_NOT_FOUND',
  PAST_SLOT: 'PAST_SLOT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type AgentErrorCodeType = (typeof AgentErrorCode)[keyof typeof AgentErrorCode];

export class AgentApiException extends Error {
  constructor(
    public readonly errorCode: AgentErrorCodeType,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AgentApiException';
  }
}
