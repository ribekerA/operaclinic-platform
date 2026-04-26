import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

class WorkspaceRealtimeEvent {
  WorkspaceRealtimeEvent({
    required this.appointmentId,
    required this.status,
    required this.event,
    required this.occurredAt,
  });

  final String appointmentId;
  final String status;
  final String event;
  final String occurredAt;

  factory WorkspaceRealtimeEvent.fromJson(Map<String, dynamic> json) {
    return WorkspaceRealtimeEvent(
      appointmentId: json['appointmentId']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      event: json['event']?.toString() ?? 'APPOINTMENT_UPDATED',
      occurredAt: json['occurredAt']?.toString() ?? '',
    );
  }
}

class WorkspaceRealtimeClient {
  WorkspaceRealtimeClient({
    required this.baseUrl,
  });

  final String baseUrl;
  final StreamController<WorkspaceRealtimeEvent> _eventsController =
      StreamController<WorkspaceRealtimeEvent>.broadcast();
  io.Socket? _socket;

  Stream<WorkspaceRealtimeEvent> get events => _eventsController.stream;

  bool get isConnected => _socket?.connected ?? false;

  void connect({
    required String accessToken,
    required String tenantId,
    required String professionalId,
  }) {
    disconnect();

    final socket = io.io(
      '$baseUrl/professional-workspace',
      io.OptionBuilder()
          .setTransports(<String>['websocket'])
          .setExtraHeaders(<String, String>{
            'Authorization': 'Bearer $accessToken',
          })
          .disableAutoConnect()
          .setQuery(<String, String>{
            'tenantId': tenantId,
            'professionalId': professionalId,
          })
          .build(),
    );

    socket.on('dashboard_updated', (dynamic payload) {
      if (payload is Map<String, dynamic>) {
        _eventsController.add(WorkspaceRealtimeEvent.fromJson(payload));
      } else if (payload is Map) {
        _eventsController.add(
          WorkspaceRealtimeEvent.fromJson(
            payload.map(
              (dynamic key, dynamic value) =>
                  MapEntry(key.toString(), value),
            ),
          ),
        );
      }
    });

    socket.connect();
    _socket = socket;
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }

  Future<void> close() async {
    disconnect();
    await _eventsController.close();
  }
}
