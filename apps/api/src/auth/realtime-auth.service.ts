import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Socket } from "socket.io";
import { AuthService } from "./auth.service";
import { ACCESS_TOKEN_TYPE } from "./constants/auth.constants";
import { AuthenticatedUser } from "./interfaces/authenticated-user.interface";
import { AuthTokenPayload } from "./interfaces/auth-token-payload.interface";

const REALTIME_ACCESS_TOKEN_COOKIES = [
  "oc_clinic_access_token",
  "oc_platform_access_token",
  "oc_access_token",
];

@Injectable()
export class RealtimeAuthService {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async authenticateSocket(client: Socket): Promise<AuthenticatedUser> {
    const token = this.extractAccessToken(client);

    if (!token) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const accessSecret = this.configService.get<string>("auth.accessSecret");

    if (!accessSecret?.trim()) {
      throw new UnauthorizedException("Access token secret is not configured.");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token, {
        secret: accessSecret,
      });

      if (payload.tokenType !== ACCESS_TOKEN_TYPE) {
        throw new UnauthorizedException("Invalid token type.");
      }

      return await this.authService.validateSessionPayload(payload);
    } catch {
      throw new UnauthorizedException("Invalid or expired access token.");
    }
  }

  private extractAccessToken(client: Socket): string | null {
    const authorizationHeader = client.handshake.headers.authorization;
    const headerToken =
      typeof authorizationHeader === "string"
        ? this.extractBearerToken(authorizationHeader)
        : null;

    if (headerToken) {
      return headerToken;
    }

    const authToken =
      client.handshake.auth &&
      typeof client.handshake.auth === "object" &&
      "token" in client.handshake.auth &&
      typeof client.handshake.auth.token === "string"
        ? client.handshake.auth.token.trim()
        : null;

    if (authToken) {
      return authToken;
    }

    const cookieHeader = client.handshake.headers.cookie;

    if (typeof cookieHeader !== "string" || !cookieHeader.trim()) {
      return null;
    }

    const cookies = new Map<string, string>();

    for (const entry of cookieHeader.split(";")) {
      const [rawName, ...rawValue] = entry.split("=");
      const name = rawName?.trim();
      const value = rawValue.join("=").trim();

      if (name && value) {
        cookies.set(name, decodeURIComponent(value));
      }
    }

    for (const cookieName of REALTIME_ACCESS_TOKEN_COOKIES) {
      const token = cookies.get(cookieName)?.trim();

      if (token) {
        return token;
      }
    }

    return null;
  }

  private extractBearerToken(authorization: string): string | null {
    const [type, token] = authorization.split(" ");

    if (type !== "Bearer" || !token) {
      return null;
    }

    return token.trim() || null;
  }
}
