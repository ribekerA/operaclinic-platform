class ProfessionalNamedEntity {
  ProfessionalNamedEntity({
    required this.id,
    required this.name,
  });

  final String id;
  final String name;

  factory ProfessionalNamedEntity.fromJson(Map<String, dynamic> json) {
    return ProfessionalNamedEntity(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
    );
  }
}

class ProfessionalLinkedUserSummary {
  ProfessionalLinkedUserSummary({
    required this.id,
    required this.email,
    required this.fullName,
    required this.status,
  });

  final String id;
  final String email;
  final String fullName;
  final String status;

  factory ProfessionalLinkedUserSummary.fromJson(Map<String, dynamic> json) {
    return ProfessionalLinkedUserSummary(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      status: json['status']?.toString() ?? 'ACTIVE',
    );
  }
}

class ProfessionalProfileInfo {
  ProfessionalProfileInfo({
    required this.id,
    required this.fullName,
    required this.displayName,
    required this.credential,
    required this.specialties,
    required this.units,
    this.linkedUser,
  });

  final String id;
  final String fullName;
  final String displayName;
  final String credential;
  final ProfessionalLinkedUserSummary? linkedUser;
  final List<ProfessionalNamedEntity> specialties;
  final List<ProfessionalNamedEntity> units;

  factory ProfessionalProfileInfo.fromJson(Map<String, dynamic> json) {
    return ProfessionalProfileInfo(
      id: json['id']?.toString() ?? '',
      fullName: json['fullName']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? 'Profissional',
      credential: json['credential']?.toString() ?? '',
      linkedUser: (json['linkedUser'] as Map<String, dynamic>?) != null
          ? ProfessionalLinkedUserSummary.fromJson(
              json['linkedUser'] as Map<String, dynamic>,
            )
          : null,
      specialties:
          ((json['specialties'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(ProfessionalNamedEntity.fromJson)
              .toList(),
      units: ((json['units'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(ProfessionalNamedEntity.fromJson)
          .toList(),
    );
  }
}

class ProfessionalDashboardSummary {
  ProfessionalDashboardSummary({
    required this.appointmentsToday,
    required this.remainingToday,
    required this.checkedInWaiting,
    required this.calledToRoom,
    required this.inProgress,
    required this.awaitingClosure,
    required this.sentToReception,
    required this.completedToday,
    required this.pendingConfirmation,
  });

  final int appointmentsToday;
  final int remainingToday;
  final int checkedInWaiting;
  final int calledToRoom;
  final int inProgress;
  final int awaitingClosure;
  final int sentToReception;
  final int completedToday;
  final int pendingConfirmation;

  factory ProfessionalDashboardSummary.fromJson(Map<String, dynamic> json) {
    return ProfessionalDashboardSummary(
      appointmentsToday: (json['appointmentsToday'] as num?)?.toInt() ?? 0,
      remainingToday: (json['remainingToday'] as num?)?.toInt() ?? 0,
      checkedInWaiting: (json['checkedInWaiting'] as num?)?.toInt() ?? 0,
      calledToRoom: (json['calledToRoom'] as num?)?.toInt() ?? 0,
      inProgress: (json['inProgress'] as num?)?.toInt() ?? 0,
      awaitingClosure: (json['awaitingClosure'] as num?)?.toInt() ?? 0,
      sentToReception: (json['sentToReception'] as num?)?.toInt() ?? 0,
      completedToday: (json['completedToday'] as num?)?.toInt() ?? 0,
      pendingConfirmation: (json['pendingConfirmation'] as num?)?.toInt() ?? 0,
    );
  }
}

class ProfessionalAgendaItem {
  ProfessionalAgendaItem({
    required this.id,
    required this.status,
    required this.startsAt,
    required this.endsAt,
    required this.consultationTypeName,
    required this.patientId,
    required this.patientName,
    required this.hasHistoricalIntercurrence,
    this.room,
    this.unitName,
    this.patientBirthDate,
    this.patientPrimaryContact,
    this.confirmedAt,
    this.checkedInAt,
    this.calledAt,
    this.startedAt,
    this.closureReadyAt,
    this.awaitingPaymentAt,
    this.completedAt,
    this.notes,
    this.lastIntercurrenceAt,
    this.lastIntercurrenceSummary,
    this.lastPreparationSummary,
    this.lastGuidanceSummary,
  });

  final String id;
  final String status;
  final String startsAt;
  final String endsAt;
  final String? room;
  final String? unitName;
  final String consultationTypeName;
  final String patientId;
  final String patientName;
  final String? patientBirthDate;
  final String? patientPrimaryContact;
  final String? confirmedAt;
  final String? checkedInAt;
  final String? calledAt;
  final String? startedAt;
  final String? closureReadyAt;
  final String? awaitingPaymentAt;
  final String? completedAt;
  final String? notes;
  final bool hasHistoricalIntercurrence;
  final String? lastIntercurrenceAt;
  final String? lastIntercurrenceSummary;
  final String? lastPreparationSummary;
  final String? lastGuidanceSummary;

  factory ProfessionalAgendaItem.fromJson(Map<String, dynamic> json) {
    return ProfessionalAgendaItem(
      id: json['id']?.toString() ?? '',
      status: json['status']?.toString() ?? 'BOOKED',
      startsAt: json['startsAt']?.toString() ?? '',
      endsAt: json['endsAt']?.toString() ?? '',
      room: json['room']?.toString(),
      unitName: json['unitName']?.toString(),
      consultationTypeName:
          json['consultationTypeName']?.toString() ?? 'Atendimento',
      patientId: json['patientId']?.toString() ?? '',
      patientName: json['patientName']?.toString() ?? 'Paciente',
      patientBirthDate: json['patientBirthDate']?.toString(),
      patientPrimaryContact: json['patientPrimaryContact']?.toString(),
      confirmedAt: json['confirmedAt']?.toString(),
      checkedInAt: json['checkedInAt']?.toString(),
      calledAt: json['calledAt']?.toString(),
      startedAt: json['startedAt']?.toString(),
      closureReadyAt: json['closureReadyAt']?.toString(),
      awaitingPaymentAt: json['awaitingPaymentAt']?.toString(),
      completedAt: json['completedAt']?.toString(),
      notes: json['notes']?.toString(),
      hasHistoricalIntercurrence:
          json['hasHistoricalIntercurrence'] as bool? ?? false,
      lastIntercurrenceAt: json['lastIntercurrenceAt']?.toString(),
      lastIntercurrenceSummary: json['lastIntercurrenceSummary']?.toString(),
      lastPreparationSummary: json['lastPreparationSummary']?.toString(),
      lastGuidanceSummary: json['lastGuidanceSummary']?.toString(),
    );
  }
}

class ProfessionalDashboardFocus {
  ProfessionalDashboardFocus({
    required this.calledPatient,
    required this.currentAppointment,
    required this.closingAppointment,
    required this.waitingPatient,
    required this.nextAppointment,
  });

  final ProfessionalAgendaItem? calledPatient;
  final ProfessionalAgendaItem? currentAppointment;
  final ProfessionalAgendaItem? closingAppointment;
  final ProfessionalAgendaItem? waitingPatient;
  final ProfessionalAgendaItem? nextAppointment;

  factory ProfessionalDashboardFocus.fromJson(Map<String, dynamic> json) {
    return ProfessionalDashboardFocus(
      calledPatient: (json['calledPatient'] as Map<String, dynamic>?) != null
          ? ProfessionalAgendaItem.fromJson(
              json['calledPatient'] as Map<String, dynamic>,
            )
          : null,
      currentAppointment:
          (json['currentAppointment'] as Map<String, dynamic>?) != null
              ? ProfessionalAgendaItem.fromJson(
                  json['currentAppointment'] as Map<String, dynamic>,
                )
              : null,
      closingAppointment:
          (json['closingAppointment'] as Map<String, dynamic>?) != null
              ? ProfessionalAgendaItem.fromJson(
                  json['closingAppointment'] as Map<String, dynamic>,
                )
              : null,
      waitingPatient: (json['waitingPatient'] as Map<String, dynamic>?) != null
          ? ProfessionalAgendaItem.fromJson(
              json['waitingPatient'] as Map<String, dynamic>,
            )
          : null,
      nextAppointment:
          (json['nextAppointment'] as Map<String, dynamic>?) != null
              ? ProfessionalAgendaItem.fromJson(
                  json['nextAppointment'] as Map<String, dynamic>,
                )
              : null,
    );
  }
}

class ProfessionalDashboard {
  ProfessionalDashboard({
    required this.generatedAt,
    required this.date,
    required this.timezone,
    required this.clinicDisplayName,
    required this.professional,
    required this.summary,
    required this.focus,
    required this.recentCompleted,
    required this.todayAgenda,
    required this.upcomingAgenda,
  });

  final String generatedAt;
  final String date;
  final String timezone;
  final String? clinicDisplayName;
  final ProfessionalProfileInfo professional;
  final ProfessionalDashboardSummary summary;
  final ProfessionalDashboardFocus focus;
  final List<ProfessionalAgendaItem> recentCompleted;
  final List<ProfessionalAgendaItem> todayAgenda;
  final List<ProfessionalAgendaItem> upcomingAgenda;

  String get professionalDisplayName => professional.displayName;

  factory ProfessionalDashboard.fromJson(Map<String, dynamic> json) {
    return ProfessionalDashboard(
      generatedAt: json['generatedAt']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      timezone: json['timezone']?.toString() ?? '',
      clinicDisplayName: json['clinicDisplayName']?.toString(),
      professional: ProfessionalProfileInfo.fromJson(
        json['professional'] as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
      summary: ProfessionalDashboardSummary.fromJson(
        json['summary'] as Map<String, dynamic>? ?? const <String, dynamic>{},
      ),
      focus: ProfessionalDashboardFocus.fromJson(
        json['focus'] as Map<String, dynamic>? ?? const <String, dynamic>{},
      ),
      recentCompleted:
          ((json['recentCompleted'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(ProfessionalAgendaItem.fromJson)
              .toList(),
      todayAgenda:
          ((json['todayAgenda'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(ProfessionalAgendaItem.fromJson)
              .toList(),
      upcomingAgenda:
          ((json['upcomingAgenda'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(ProfessionalAgendaItem.fromJson)
              .toList(),
    );
  }
}

class ProfessionalPatientContact {
  ProfessionalPatientContact({
    required this.type,
    required this.value,
    required this.isPrimary,
  });

  final String type;
  final String value;
  final bool isPrimary;

  factory ProfessionalPatientContact.fromJson(Map<String, dynamic> json) {
    return ProfessionalPatientContact(
      type: json['type']?.toString() ?? 'PHONE',
      value: json['value']?.toString() ?? '',
      isPrimary: json['isPrimary'] as bool? ?? false,
    );
  }
}

class ProfessionalPatientRecord {
  ProfessionalPatientRecord({
    required this.id,
    required this.fullName,
    required this.birthDate,
    required this.documentNumber,
    required this.notes,
    required this.isActive,
    required this.contacts,
  });

  final String id;
  final String? fullName;
  final String? birthDate;
  final String? documentNumber;
  final String? notes;
  final bool isActive;
  final List<ProfessionalPatientContact> contacts;

  factory ProfessionalPatientRecord.fromJson(Map<String, dynamic> json) {
    return ProfessionalPatientRecord(
      id: json['id']?.toString() ?? '',
      fullName: json['fullName']?.toString(),
      birthDate: json['birthDate']?.toString(),
      documentNumber: json['documentNumber']?.toString(),
      notes: json['notes']?.toString(),
      isActive: json['isActive'] as bool? ?? true,
      contacts: ((json['contacts'] as List<dynamic>?) ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(ProfessionalPatientContact.fromJson)
          .toList(),
    );
  }
}

class ProfessionalPatientRelationship {
  ProfessionalPatientRelationship({
    required this.appointmentsWithProfessional,
    required this.lastSeenAt,
    required this.nextAppointmentAt,
  });

  final int appointmentsWithProfessional;
  final String? lastSeenAt;
  final String? nextAppointmentAt;

  factory ProfessionalPatientRelationship.fromJson(
    Map<String, dynamic> json,
  ) {
    return ProfessionalPatientRelationship(
      appointmentsWithProfessional:
          (json['appointmentsWithProfessional'] as num?)?.toInt() ?? 0,
      lastSeenAt: json['lastSeenAt']?.toString(),
      nextAppointmentAt: json['nextAppointmentAt']?.toString(),
    );
  }
}

class ProfessionalPatientAlerts {
  ProfessionalPatientAlerts({
    required this.hasHistoricalIntercurrence,
    required this.lastIntercurrenceAt,
    required this.lastIntercurrenceSummary,
    required this.lastPreparationSummary,
    required this.lastGuidanceSummary,
  });

  final bool hasHistoricalIntercurrence;
  final String? lastIntercurrenceAt;
  final String? lastIntercurrenceSummary;
  final String? lastPreparationSummary;
  final String? lastGuidanceSummary;

  factory ProfessionalPatientAlerts.fromJson(Map<String, dynamic> json) {
    return ProfessionalPatientAlerts(
      hasHistoricalIntercurrence:
          json['hasHistoricalIntercurrence'] as bool? ?? false,
      lastIntercurrenceAt: json['lastIntercurrenceAt']?.toString(),
      lastIntercurrenceSummary: json['lastIntercurrenceSummary']?.toString(),
      lastPreparationSummary: json['lastPreparationSummary']?.toString(),
      lastGuidanceSummary: json['lastGuidanceSummary']?.toString(),
    );
  }
}

class ProfessionalPatientAppointmentSummary {
  ProfessionalPatientAppointmentSummary({
    required this.id,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.consultationTypeName,
    required this.professionalName,
    required this.unitName,
    required this.room,
    required this.notes,
  });

  final String id;
  final String startsAt;
  final String endsAt;
  final String status;
  final String consultationTypeName;
  final String professionalName;
  final String? unitName;
  final String? room;
  final String? notes;

  factory ProfessionalPatientAppointmentSummary.fromJson(
    Map<String, dynamic> json,
  ) {
    return ProfessionalPatientAppointmentSummary(
      id: json['id']?.toString() ?? '',
      startsAt: json['startsAt']?.toString() ?? '',
      endsAt: json['endsAt']?.toString() ?? '',
      status: json['status']?.toString() ?? 'BOOKED',
      consultationTypeName:
          json['consultationTypeName']?.toString() ?? 'Atendimento',
      professionalName: json['professionalName']?.toString() ?? 'Profissional',
      unitName: json['unitName']?.toString(),
      room: json['room']?.toString(),
      notes: json['notes']?.toString(),
    );
  }
}

class ProfessionalPatientSummary {
  ProfessionalPatientSummary({
    required this.patient,
    required this.relationship,
    required this.alerts,
    required this.recentAppointments,
  });

  final ProfessionalPatientRecord patient;
  final ProfessionalPatientRelationship relationship;
  final ProfessionalPatientAlerts alerts;
  final List<ProfessionalPatientAppointmentSummary> recentAppointments;

  factory ProfessionalPatientSummary.fromJson(Map<String, dynamic> json) {
    return ProfessionalPatientSummary(
      patient: ProfessionalPatientRecord.fromJson(
        json['patient'] as Map<String, dynamic>? ?? const <String, dynamic>{},
      ),
      relationship: ProfessionalPatientRelationship.fromJson(
        json['relationship'] as Map<String, dynamic>? ??
            const <String, dynamic>{},
      ),
      alerts: ProfessionalPatientAlerts.fromJson(
        json['alerts'] as Map<String, dynamic>? ?? const <String, dynamic>{},
      ),
      recentAppointments:
          ((json['recentAppointments'] as List<dynamic>?) ?? const <dynamic>[])
              .whereType<Map<String, dynamic>>()
              .map(ProfessionalPatientAppointmentSummary.fromJson)
              .toList(),
    );
  }
}
