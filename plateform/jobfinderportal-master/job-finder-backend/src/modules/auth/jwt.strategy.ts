import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { HRUserService } from './hr-user.service';

export interface HRJwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private hrUserService: HRUserService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'local_dev_super_secret_change_me',
    });
  }

  async validate(payload: HRJwtPayload) {
    const user = await this.hrUserService.findById(payload.sub);
    return user ?? null;
  }
}
