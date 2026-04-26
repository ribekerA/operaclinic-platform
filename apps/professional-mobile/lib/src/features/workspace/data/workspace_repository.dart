import '../../../core/network/api_client.dart';
import '../models/dashboard.dart';

class WorkspaceRepository {
  WorkspaceRepository({required this.apiClient});

  final ApiClient apiClient;

  Future<ProfessionalDashboard> loadDashboard(String accessToken) async {
    final payload = await apiClient.getJson(
      '/professional-workspace/dashboard',
      bearerToken: accessToken,
    );

    return ProfessionalDashboard.fromJson(payload);
  }

  Future<ProfessionalDashboard> updateAppointmentStatus({
    required String accessToken,
    required String appointmentId,
    required String status,
    String? reason,
  }) async {
    final payload = await apiClient.patchJson(
      '/professional-workspace/appointments/$appointmentId/status',
      bearerToken: accessToken,
      body: <String, dynamic>{
        'status': status,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    );

    return ProfessionalDashboard.fromJson(payload);
  }

  Future<ProfessionalDashboard> updateAppointmentNotes({
    required String accessToken,
    required String appointmentId,
    required String notes,
  }) async {
    final payload = await apiClient.patchJson(
      '/professional-workspace/appointments/$appointmentId/notes',
      bearerToken: accessToken,
      body: <String, dynamic>{
        'notes': notes,
      },
    );

    return ProfessionalDashboard.fromJson(payload);
  }

  Future<ProfessionalPatientSummary> loadPatientSummary({
    required String accessToken,
    required String patientId,
  }) async {
    final payload = await apiClient.getJson(
      '/professional-workspace/patients/$patientId/summary',
      bearerToken: accessToken,
    );

    return ProfessionalPatientSummary.fromJson(payload);
  }
}
