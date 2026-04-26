import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() {
    return 'ApiException(statusCode: $statusCode, message: $message)';
  }
}

class ApiClient {
  ApiClient({required this.baseUrl});

  final String baseUrl;

  Future<Map<String, dynamic>> postJson(
    String path, {
    required Map<String, dynamic> body,
    String? bearerToken,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (bearerToken != null) 'Authorization': 'Bearer $bearerToken',
    };

    final response = await http.post(
      uri,
      headers: headers,
      body: jsonEncode(body),
    );

    return _parseJsonResponse(response);
  }

  Future<Map<String, dynamic>> getJson(
    String path, {
    String? bearerToken,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      if (bearerToken != null) 'Authorization': 'Bearer $bearerToken',
    };

    final response = await http.get(uri, headers: headers);

    return _parseJsonResponse(response);
  }

  Future<Map<String, dynamic>> patchJson(
    String path, {
    required Map<String, dynamic> body,
    String? bearerToken,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (bearerToken != null) 'Authorization': 'Bearer $bearerToken',
    };

    final response = await http.patch(
      uri,
      headers: headers,
      body: jsonEncode(body),
    );

    return _parseJsonResponse(response);
  }

  Map<String, dynamic> _parseJsonResponse(http.Response response) {
    final raw = response.body.trim();
    final parsed = raw.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(raw) as Map<String, dynamic>;

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final Object? payloadMessage = parsed['message'];
      final String message;

      if (payloadMessage is List) {
        message = payloadMessage
            .map((dynamic item) => item.toString().trim())
            .where((dynamic item) => item.isNotEmpty)
            .cast<String>()
            .join('\n');
      } else {
        message = payloadMessage?.toString() ?? 'Request failed';
      }

      throw ApiException(message, statusCode: response.statusCode);
    }

    return parsed;
  }
}
