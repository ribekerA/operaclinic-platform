import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthService } from "../auth.service";
import { ACCESS_TOKEN_TYPE } from "../constants/auth.constants";
import { AuthenticatedRequest } from "../interfaces/authenticated-request.interface";
import { AuthTokenPayload } from "../interfaces/auth-token-payload.interface";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException("Access token is missing.");
    }

    try {
      const accessSecret = this.configService.get<string>("auth.accessSecret");

      if (!accessSecret?.trim()) {
        throw new UnauthorizedException("Access token secret is not configured.");
      }

      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token, {
        secret: accessSecret,
      });

      if (payload.tokenType !== ACCESS_TOKEN_TYPE) {
        throw new UnauthorizedException("Invalid token type.");
      }

      request.user = await this.authService.validateSessionPayload(payload);

      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token.");
    }
  }

  private extractBearerToken(request: Request): string | null {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(" ");

    if (type !== "Bearer" || !token) {
      return null;
    }

    return token;
  }
}
