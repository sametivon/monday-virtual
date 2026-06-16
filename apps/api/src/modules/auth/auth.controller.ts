import { Body, Controller, Post } from '@nestjs/common';
import {
  AuthTokens,
  OAuthCallbackRequestSchema,
  SessionAuthRequestSchema,
  type OAuthCallbackRequest,
  type SessionAuthRequest,
} from '@mvs/shared';
import { Public } from '../../common/auth/public.decorator';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { MondayAuthService } from './monday-auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly monday: MondayAuthService,
  ) {}

  /** Seamless in-iframe login: monday SDK sessionToken → app JWTs. */
  @Public()
  @Post('session')
  async session(
    @Body(new ZodBody(SessionAuthRequestSchema)) dto: SessionAuthRequest,
  ): Promise<AuthTokens> {
    const identity = await this.monday.resolveIdentity(dto.sessionToken, dto.profile);
    return this.auth.loginWithMondayIdentity(identity);
  }

  /** OAuth redirect callback: code → access token → identity → app JWTs. */
  @Public()
  @Post('monday/callback')
  async oauthCallback(
    @Body(new ZodBody(OAuthCallbackRequestSchema)) dto: OAuthCallbackRequest,
  ): Promise<AuthTokens> {
    const { accessToken } = await this.monday.exchangeOAuthCode(dto.code);
    const identity = await this.monday.fetchMe(accessToken);
    // Persisting the encrypted Monday token for board reads happens in the
    // monday module on first board access; here we just establish the session.
    return this.auth.loginWithMondayIdentity(identity);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string): Promise<AuthTokens> {
    return this.auth.refresh(refreshToken);
  }
}
