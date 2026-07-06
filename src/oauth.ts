import crypto from "node:crypto";

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  signingKey: string;
  codeTtl: number;
  tokenTtl: number;
};

type Claims = Record<string, unknown> & {
  typ?: string;
  exp?: number;
  iat?: number;
};

function sign(payload: string, key: string) {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function makeToken(claims: Claims, ttlSeconds: number, signingKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds })).toString("base64url");
  return `${payload}.${sign(payload, signingKey)}`;
}

export function verifyToken(token: string, signingKey: string, expectedType?: string): Claims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, signingKey);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    if (expectedType && claims.typ !== expectedType) return null;
    return claims;
  } catch {
    return null;
  }
}

export function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function timingSafeEqual(a: string, b: string) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
