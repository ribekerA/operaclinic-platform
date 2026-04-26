import 'package:flutter/material.dart';

import 'config/env.dart';
import 'core/network/api_client.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/auth/models/session_user.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/auth/storage/auth_session_store.dart';
import 'features/workspace/data/workspace_repository.dart';
import 'features/workspace/presentation/dashboard_page.dart';

void runOperaClinicProfessionalApp() {
  final apiClient = ApiClient(baseUrl: Env.apiBaseUrl);
  final authRepository = AuthRepository(
    apiClient: apiClient,
    sessionStore: AuthSessionStore(),
  );
  final workspaceRepository = WorkspaceRepository(apiClient: apiClient);

  runApp(
    ProfessionalApp(
      authRepository: authRepository,
      workspaceRepository: workspaceRepository,
    ),
  );
}

class ProfessionalApp extends StatefulWidget {
  const ProfessionalApp({
    super.key,
    required this.authRepository,
    required this.workspaceRepository,
  });

  final AuthRepository authRepository;
  final WorkspaceRepository workspaceRepository;

  @override
  State<ProfessionalApp> createState() => _ProfessionalAppState();
}

class _ProfessionalAppState extends State<ProfessionalApp> {
  SessionUser? _sessionUser;
  String? _accessToken;
  bool _isInitializing = true;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    try {
      final session = await widget.authRepository.restoreSession();

      if (!mounted || session == null) {
        return;
      }

      setState(() {
        _sessionUser = session.user;
        _accessToken = session.accessToken;
      });
    } finally {
      if (mounted) {
        setState(() {
          _isInitializing = false;
        });
      }
    }
  }

  void _onLoggedIn(SessionUser user, String accessToken) {
    setState(() {
      _sessionUser = user;
      _accessToken = accessToken;
    });
  }

  Future<void> _onLogout() async {
    await widget.authRepository.logout();

    setState(() {
      _sessionUser = null;
      _accessToken = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    const seedColor = Color(0xFF0B6E6E);
    final baseColorScheme = ColorScheme.fromSeed(
      seedColor: seedColor,
      brightness: Brightness.light,
    );
    final colorScheme = baseColorScheme.copyWith(
      primary: const Color(0xFF0B8F86),
      onPrimary: Colors.white,
      primaryContainer: const Color(0xFFCAF6F0),
      onPrimaryContainer: const Color(0xFF062C2A),
      secondary: const Color(0xFF1D4ED8),
      secondaryContainer: const Color(0xFFDCE7FF),
      tertiary: const Color(0xFF7C5CF5),
      tertiaryContainer: const Color(0xFFE8E0FF),
      surface: const Color(0xFFF6FBFA),
      surfaceContainerHighest: const Color(0xFFE6EFEE),
      outline: const Color(0xFFB8C8C6),
    );

    return MaterialApp(
      title: 'OperaClinic Profissional',
      theme: ThemeData(
        colorScheme: colorScheme,
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF3F8F7),
        snackBarTheme: SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: const Color(0xFF0C171B),
          contentTextStyle: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: const Color(0xFFF3F8F7),
          foregroundColor: colorScheme.onSurface,
          elevation: 0,
          surfaceTintColor: Colors.transparent,
          centerTitle: false,
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          surfaceTintColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
            side: BorderSide(
              color: colorScheme.outline.withValues(alpha: 0.14),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 18,
          ),
          labelStyle: TextStyle(color: colorScheme.onSurfaceVariant),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: BorderSide(
              color: colorScheme.outline.withValues(alpha: 0.16),
            ),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: BorderSide(
              color: colorScheme.outline.withValues(alpha: 0.16),
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: BorderSide(color: colorScheme.primary, width: 1.4),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: BorderSide(color: colorScheme.error),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(20),
            borderSide: BorderSide(color: colorScheme.error, width: 1.4),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(56),
            backgroundColor: colorScheme.primary,
            foregroundColor: colorScheme.onPrimary,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(0, 48),
            foregroundColor: colorScheme.primary,
            side: BorderSide(
              color: colorScheme.outline.withValues(alpha: 0.4),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
      ),
      home: _isInitializing
          ? const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            )
          : _sessionUser == null || _accessToken == null
              ? LoginPage(
                  authRepository: widget.authRepository,
                  onLoggedIn: _onLoggedIn,
                )
              : DashboardPage(
                  sessionUser: _sessionUser!,
                  accessToken: _accessToken!,
                  workspaceRepository: widget.workspaceRepository,
                  onLogout: _onLogout,
                ),
    );
  }
}
