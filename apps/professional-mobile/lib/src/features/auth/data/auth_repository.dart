import '../../../core/network/api_client.dart';
import '../models/session_user.dart';
import '../storage/auth_session_store.dart';

class AuthSession {
  AuthSession({
    required this.accessToken,
    required this.user,
  });

  final String accessToken;
  final SessionUser user;
}

class AuthRepository {
  AuthRepository({
    required this.apiClient,
    required this.sessionStore,
  });

  final ApiClient apiClient;
  final AuthSessionStore sessionStore;

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final payload = await apiClient.postJson(
      '/auth/login',
      body: <String, dynamic>{
        'email': email,
        'password': password,
        'profile': 'clinic',
      },
    );

    final accessToken = payload['accessToken'] as String?;
    final userJson = payload['user'] as Map<String, dynamic>?;

    if (accessToken == null || userJson == null) {
      throw ApiException('Invalid login response');
    }

    final user = SessionUser.fromJson(userJson);

    if (!user.roles.contains('PROFESSIONAL')) {
      throw ApiException('Usuario nao possui role PROFESSIONAL.');
    }

    await sessionStore.save(accessToken: accessToken, user: user);

    return AuthSession(accessToken: accessToken, user: user);
  }

  Future<AuthSession?> restoreSession() async {
    final stored = await sessionStore.restore();
    if (stored == null) {
      return null;
    }

    return AuthSession(accessToken: stored.accessToken, user: stored.user);
  }

  Future<void> logout() async {
    await sessionStore.clear();
  }
}
