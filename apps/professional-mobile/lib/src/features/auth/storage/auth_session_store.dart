import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/session_user.dart';

class StoredSession {
  StoredSession({
    required this.accessToken,
    required this.user,
  });

  final String accessToken;
  final SessionUser user;
}

class AuthSessionStore {
  AuthSessionStore({FlutterSecureStorage? secureStorage})
      : _secureStorage = secureStorage ?? const FlutterSecureStorage();

  static const String _accessTokenKey = 'operaclinic_professional_access_token';
  static const String _sessionUserKey = 'operaclinic_professional_session_user';

  final FlutterSecureStorage _secureStorage;

  Future<void> save({
    required String accessToken,
    required SessionUser user,
  }) async {
    await _secureStorage.write(key: _accessTokenKey, value: accessToken);
    await _secureStorage.write(
      key: _sessionUserKey,
      value: jsonEncode(user.toJson()),
    );
  }

  Future<StoredSession?> restore() async {
    final accessToken = await _secureStorage.read(key: _accessTokenKey);
    final userRaw = await _secureStorage.read(key: _sessionUserKey);

    if (accessToken == null || userRaw == null) {
      return null;
    }

    final dynamic parsed = jsonDecode(userRaw);
    if (parsed is! Map<String, dynamic>) {
      return null;
    }

    return StoredSession(
      accessToken: accessToken,
      user: SessionUser.fromJson(parsed),
    );
  }

  Future<void> clear() async {
    await _secureStorage.delete(key: _accessTokenKey);
    await _secureStorage.delete(key: _sessionUserKey);
  }
}
