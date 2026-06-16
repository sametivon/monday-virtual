import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppJwtPayload } from '@mvs/shared';
import type { Env } from '../../config/env';
import type { RequestUser } from './current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  /** Passport calls this with the verified payload; return value becomes req.user. */
  validate(payload: AppJwtPayload): RequestUser {
    return { ...payload, tenantId: payload.tenantId };
  }
}
