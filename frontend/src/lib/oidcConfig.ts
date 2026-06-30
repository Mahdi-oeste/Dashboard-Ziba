import { UserManagerSettings } from 'oidc-client-ts';

const DEFAULT_AUTHORITY = 'https://auth.oeste.mx/realms/ziba-calendario';
const DEFAULT_CLIENT_ID = 'ziba-frontend';

export const AUTH_DISABLED =
  String(import.meta.env.VITE_AUTH_DISABLED ?? '').toLowerCase() === 'true';

const authority = (import.meta.env.VITE_AUTHORITY as string | undefined) || DEFAULT_AUTHORITY;
const clientId = (import.meta.env.VITE_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID;
const clientSecret = import.meta.env.VITE_CLIENT_SECRET as string | undefined;

const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';

const baseConfig: UserManagerSettings = {
  authority,
  client_id: clientId,
  redirect_uri: origin + '/callback',
  post_logout_redirect_uri: origin + '/',
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  loadUserInfo: true,
  silent_redirect_uri: origin + '/silent-callback',
  includeIdTokenInSilentRenew: true,
  filterProtocolClaims: true,
  monitorSession: true,
  accessTokenExpiringNotificationTimeInSeconds: 60,
  revokeTokensOnSignout: true,
  metadata: {
    issuer: authority,
    authorization_endpoint: authority + '/protocol/openid-connect/auth',
    token_endpoint: authority + '/protocol/openid-connect/token',
    userinfo_endpoint: authority + '/protocol/openid-connect/userinfo',
    end_session_endpoint: authority + '/protocol/openid-connect/logout',
    jwks_uri: authority + '/protocol/openid-connect/certs',
    revocation_endpoint: authority + '/protocol/openid-connect/revoke',
  },
};

export const oidcConfig: UserManagerSettings = clientSecret
  ? { ...baseConfig, client_secret: clientSecret }
  : baseConfig;
