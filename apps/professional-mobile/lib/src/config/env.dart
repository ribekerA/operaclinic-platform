class Env {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3001/api/v1',
  );

  static String get realtimeBaseUrl {
    final baseUri = Uri.parse(apiBaseUrl);
    final segments = List<String>.from(baseUri.pathSegments);

    if (segments.length >= 2 &&
        segments[segments.length - 2] == 'api' &&
        segments.last == 'v1') {
      segments.removeLast();
      segments.removeLast();
    }

    return baseUri.replace(pathSegments: segments).toString();
  }
}
