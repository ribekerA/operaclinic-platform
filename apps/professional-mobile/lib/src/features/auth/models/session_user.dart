class SessionUser {
  SessionUser({
    required this.id,
    required this.email,
    required this.profile,
    required this.roles,
    required this.activeTenantId,
    this.fullName,
    this.linkedProfessionalId,
  });

  final String id;
  final String email;
  final String profile;
  final List<String> roles;
  final String? activeTenantId;
  final String? fullName;
  final String? linkedProfessionalId;

  factory SessionUser.fromJson(Map<String, dynamic> json) {
    return SessionUser(
      id: json['id'] as String,
      email: json['email'] as String,
      profile: json['profile'] as String,
      roles: ((json['roles'] as List<dynamic>?) ?? const <dynamic>[])
          .map((dynamic role) => role.toString())
          .toList(),
      activeTenantId: json['activeTenantId']?.toString(),
      fullName: json['fullName']?.toString(),
      linkedProfessionalId: json['linkedProfessionalId']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'id': id,
      'email': email,
      'profile': profile,
      'roles': roles,
      'activeTenantId': activeTenantId,
      'fullName': fullName,
      'linkedProfessionalId': linkedProfessionalId,
    };
  }
}
