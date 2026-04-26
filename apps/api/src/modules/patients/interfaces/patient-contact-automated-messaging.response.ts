export interface PatientContactAutomatedMessagingPreferenceResponse {
  patientId: string;
  contactId: string;
  allowAutomatedMessaging: boolean;
  automatedMessagingOptedOutAt: string | null;
  updatedAt: string;
}
