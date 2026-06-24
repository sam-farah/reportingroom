// Shared OAuth 2.0 (authorization-code) helpers for the OAuth mailbox providers
// (Microsoft 365 + Google). Each clinic connects ITS OWN mailbox through OUR single
// registered app, so the client id/secret are server-wide secrets while the
// access/refresh tokens are stored per clinic on mailbox_connections.
//
// Nothing here is provider-specific beyond the CONFIGS table — adding another
// OAuth provider is a config entry plus an identity-fetch branch.

import crypto from "crypto";
import type { MailContext } from "./types";

export type OAuthProviderKey = "microsoft_oauth" | "google_oauth";

interface OAuthConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  extraAuthParams?: Record<string, string>;
}

const CONFIGS: Record<OAuthProviderKey, OAuthConfig> = {
  microsoft_oauth: {
    clientIdEnv: "MS_OAUTH_CLIENT_ID",
    clientSecretEnv: "MS_OAUTH_CLIENT_SECRET",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // offline_access => refresh token; Mail.ReadWrite + Mail.Send for inbox/sync/send.
    scopes: [
      "offline_access",
      "openid",
      "email",
      "profile",
      "https://graph.microsoft.com/Mail.ReadWrite",
      "https://graph.microsoft.com/Mail.Send",
      "https://graph.microsoft.com/User.Read",
    ],
    extraAuthParams: { prompt: "select_account" },
  },
  google_oauth: {
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    // gmail.modify covers read + send + label changes; userinfo.email for identity.
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ],
    // access_type=offline + prompt=consent guarantee a refresh token every time.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
};

/** True when OUR app credentials for this provider are present on the server. */
export function isOAuthServerConfigured(provider: OAuthProviderKey): boolean {
  const cfg = CONFIGS[provider];
  return !!(process.env[cfg.clientIdEnv] && process.env[cfg.clientSecretEnv]);
}

// ── Signed, expiring state token ───────────────────────────────────────────────
// The OAuth `state` round-trips clinic/user identity through the provider. We sign
// it (HMAC) and expire it so a returned callback can't be forged or replayed to
// attach a mailbox to the wrong clinic.
const STATE_KEY =
  process.env.MEDICAL_DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET || "dev-oauth-state-key";
const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  provider: OAuthProviderKey;
  clinicId: number;
  userId: string;
  nonce: string;
  exp: number;
}

export function signState(input: { provider: OAuthProviderKey; clinicId: number; userId: string; nonce?: string }): string {
  const payload: OAuthState = {
    provider: input.provider,
    clinicId: input.clinicId,
    userId: input.userId,
    nonce: input.nonce || crypto.randomBytes(12).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", STATE_KEY).update(json).digest("base64url");
  return `${json}.${sig}`;
}

export function verifyState(token: string | undefined | null): OAuthState | null {
  try {
    if (!token) return null;
    const [json, sig] = token.split(".");
    if (!json || !sig) return null;
    const expected = crypto.createHmac("sha256", STATE_KEY).update(json).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf8")) as OAuthState;
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Authorization URL + token exchange ─────────────────────────────────────────
export function buildAuthUrl(
  provider: OAuthProviderKey,
  opts: { redirectUri: string; state: string; loginHint?: string },
): string {
  const cfg = CONFIGS[provider];
  const params = new URLSearchParams({
    client_id: process.env[cfg.clientIdEnv] || "",
    response_type: "code",
    redirect_uri: opts.redirectUri,
    scope: cfg.scopes.join(" "),
    state: opts.state,
    ...(cfg.extraAuthParams || {}),
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${cfg.authUrl}?${params.toString()}`;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // seconds
  scope?: string;
}

async function tokenRequest(
  provider: OAuthProviderKey,
  body: Record<string, string>,
): Promise<TokenResponse> {
  const cfg = CONFIGS[provider];
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(`${provider} OAuth is not configured on the server.`);
  }
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `OAuth token error ${res.status}: ${data?.error_description || data?.error || "unknown"}`.slice(0, 300),
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in) || 3600,
    scope: data.scope,
  };
}

export function exchangeCode(
  provider: OAuthProviderKey,
  opts: { code: string; redirectUri: string },
): Promise<TokenResponse> {
  return tokenRequest(provider, {
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
}

export function refreshAccessToken(
  provider: OAuthProviderKey,
  refreshToken: string,
): Promise<TokenResponse> {
  return tokenRequest(provider, { grant_type: "refresh_token", refresh_token: refreshToken });
}

// ── Identity discovery (who did we just connect?) ─────────────────────────────
export interface OAuthIdentity {
  address: string | null;
  displayName: string | null;
  accountId: string | null;
}

export async function fetchOAuthIdentity(
  provider: OAuthProviderKey,
  accessToken: string,
): Promise<OAuthIdentity> {
  if (provider === "microsoft_oauth") {
    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName,id",
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    if (!res.ok) return { address: null, displayName: null, accountId: null };
    const me: any = await res.json();
    return {
      address: me?.mail || me?.userPrincipalName || null,
      displayName: me?.displayName || null,
      accountId: me?.id || null,
    };
  }
  // google
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) return { address: null, displayName: null, accountId: null };
  const info: any = await res.json();
  return {
    address: info?.email || null,
    displayName: info?.name || null,
    accountId: info?.id || null,
  };
}

// ── Per-request valid access token (with transparent refresh) ──────────────────
// Returns a usable access token for this clinic, refreshing + persisting via the
// context's saveTokens callback when the cached token is missing/near-expiry. Also
// updates the in-memory connection snapshot so repeated calls in one provider
// instance don't refresh again.
export async function getValidOAuthAccessToken(ctx: MailContext): Promise<string> {
  const provider = ctx.connection.provider as OAuthProviderKey;
  const expMs = ctx.connection.accessTokenExpiresAt
    ? new Date(ctx.connection.accessTokenExpiresAt).getTime()
    : 0;
  if (ctx.connection.accessToken && expMs - Date.now() > 60_000) {
    return ctx.connection.accessToken;
  }
  const refreshToken = ctx.connection.refreshToken;
  if (!refreshToken) {
    throw new Error("Mailbox needs to be reconnected (no refresh token on file).");
  }
  const tok = await refreshAccessToken(provider, refreshToken);
  const accessTokenExpiresAt = new Date(Date.now() + tok.expiresIn * 1000);
  await ctx.saveTokens({
    accessToken: tok.accessToken,
    accessTokenExpiresAt,
    refreshToken: tok.refreshToken, // some providers rotate refresh tokens
  });
  ctx.connection.accessToken = tok.accessToken;
  ctx.connection.accessTokenExpiresAt = accessTokenExpiresAt;
  if (tok.refreshToken) ctx.connection.refreshToken = tok.refreshToken;
  return tok.accessToken;
}
