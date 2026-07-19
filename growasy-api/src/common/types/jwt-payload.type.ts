export interface JwtAccessPayload {
  sub: string; // userId
  email: string;
  sessionId: string;
}

export interface JwtRefreshPayload {
  sub: string; // userId
  sessionId: string;
  /** Random nonce so two refreshes issued within the same second never collide byte-for-byte. */
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  sessionId: string;
}
