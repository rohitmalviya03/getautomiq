export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface AuthUserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  status: string;
  organizationId: string;
}

export interface AuthResult {
  user: AuthUserView;
  tokens: AuthTokens;
}
