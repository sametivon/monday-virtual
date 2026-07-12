import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { request } from 'undici';
import type { MondaySubscription } from '@mvs/shared';
import type { Env } from '../../config/env';

/**
 * monday.com identity primitives:
 *  - verifySessionToken: the short-lived JWT the monday SDK hands the iframe,
 *    signed with our app's MONDAY_SIGNING_SECRET. Used for seamless in-iframe
 *    login (no redirect).
 *  - exchangeOAuthCode: full OAuth code → access token, for server-side board
 *    reads via the Monday GraphQL API.
 *  - fetchMe: resolve the current Monday user + account from an access token.
 */
export interface MondayIdentity {
  mondayUserId: string;
  mondayAccountId: string;
  email: string;
  name: string;
  /**
   * Marketplace subscription claim, present in sessionTokens once the app is
   * monetized (absent for dev tokens and pre-marketplace installs). Signed by
   * monday, so trustworthy — unlike anything the client sends us directly.
   */
  subscription: MondaySubscription | null;
}

interface MondaySessionClaims {
  dat?: {
    user_id?: number | string;
    account_id?: number | string;
    user_email?: string;
    user_name?: string;
    subscription?: MondaySubscription;
  };
  // Some token variants put fields at the top level.
  user_id?: number | string;
  account_id?: number | string;
  subscription?: MondaySubscription;
}

@Injectable()
export class MondayAuthService {
  private readonly logger = new Logger(MondayAuthService.name);
  private readonly graphqlUrl = 'https://api.monday.com/v2';
  private readonly tokenUrl = 'https://auth.monday.com/oauth2/token';

  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Verify the iframe sessionToken and extract identity.
   * monday signs sessionTokens with the app's CLIENT secret (the signing
   * secret is only used for board webhooks) — see
   * https://developer.monday.com/apps/docs/mondayget. We also accept the
   * signing secret as a fallback so locally generated dev tokens keep working.
   */
  verifySessionToken(token: string): MondayIdentity {
    const secrets = [
      this.config.get('MONDAY_CLIENT_SECRET', { infer: true }),
      this.config.get('MONDAY_SIGNING_SECRET', { infer: true }),
    ].filter((s): s is string => Boolean(s));
    if (secrets.length === 0) {
      throw new UnauthorizedException('Monday client/signing secret not configured');
    }
    let claims: MondaySessionClaims | null = null;
    let lastError = '';
    for (const secret of secrets) {
      try {
        claims = jwt.verify(token, secret) as MondaySessionClaims;
        break;
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    if (!claims) {
      this.logger.warn(`sessionToken verification failed: ${lastError}`);
      throw new UnauthorizedException('Invalid Monday session token');
    }

    const dat = claims.dat ?? {};
    const userId = dat.user_id ?? claims.user_id;
    const accountId = dat.account_id ?? claims.account_id;
    if (userId == null || accountId == null) {
      throw new UnauthorizedException('Session token missing user/account identity');
    }
    return {
      mondayUserId: String(userId),
      mondayAccountId: String(accountId),
      email: dat.user_email ?? '',
      name: dat.user_name ?? 'Monday User',
      subscription: dat.subscription ?? claims.subscription ?? null,
    };
  }

  /**
   * Verify a sessionToken AND resolve the user's real display name. View
   * sessionTokens carry neither name/email nor API access (monday rejects
   * them as API tokens — verified empirically), so the display profile is
   * fetched client-side via seamless me() and passed along. It's cosmetic:
   * the ids always come from the verified token. A server-side me() is still
   * attempted last for token types that DO have API access (OAuth).
   */
  async resolveIdentity(
    sessionToken: string,
    profile?: { name: string; email?: string },
  ): Promise<MondayIdentity> {
    const identity = this.verifySessionToken(sessionToken);
    if (identity.email && identity.name !== 'Monday User') return identity;
    if (profile?.name) {
      return { ...identity, name: profile.name, email: profile.email || identity.email };
    }
    try {
      const full = await this.fetchMe(sessionToken);
      return {
        ...identity,
        name: full.name || identity.name,
        email: full.email || identity.email,
      };
    } catch (err) {
      this.logger.warn(`seamless me() lookup failed: ${(err as Error).message}`);
      return identity;
    }
  }

  /** Exchange an OAuth authorization code for an access token. */
  async exchangeOAuthCode(code: string): Promise<{ accessToken: string; scopes: string }> {
    const clientId = this.config.get('MONDAY_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('MONDAY_CLIENT_SECRET', { infer: true });
    const redirectUri = this.config.get('MONDAY_OAUTH_REDIRECT_URI', { infer: true });
    if (!clientId || !clientSecret || !redirectUri) {
      throw new UnauthorizedException('Monday OAuth is not configured');
    }

    const res = await request(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      this.logger.error(`OAuth token exchange failed (${res.statusCode}): ${text}`);
      throw new UnauthorizedException('Monday OAuth exchange failed');
    }
    const json = (await res.body.json()) as { access_token: string; scope?: string };
    return { accessToken: json.access_token, scopes: json.scope ?? '' };
  }

  /** Resolve the current Monday user + account from an access token. */
  async fetchMe(accessToken: string): Promise<MondayIdentity> {
    const query = `query { me { id name email account { id } } }`;
    const data = await this.graphql<{
      me: { id: string; name: string; email: string; account: { id: string } };
    }>(query, accessToken);
    return {
      mondayUserId: String(data.me.id),
      mondayAccountId: String(data.me.account.id),
      email: data.me.email,
      name: data.me.name,
      subscription: null, // OAuth me() carries no subscription; the token claim does
    };
  }

  /** Generic authenticated GraphQL call against the Monday API. */
  async graphql<T>(query: string, accessToken: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await request(this.graphqlUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: accessToken,
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.body.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new Error(`Monday API error: ${json.errors.map((e) => e.message).join('; ')}`);
    }
    if (!json.data) throw new Error('Monday API returned no data');
    return json.data;
  }
}
