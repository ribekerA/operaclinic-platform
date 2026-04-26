import { AuthenticatedUser } from "./authenticated-user.interface";

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  user: AuthenticatedUser;
}
