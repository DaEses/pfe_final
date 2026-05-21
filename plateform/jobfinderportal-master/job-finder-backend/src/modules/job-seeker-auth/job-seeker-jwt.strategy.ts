import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JobSeekerJwtPayload {
  id: string;
  email: string;
  type: string;
}

@Injectable()
export class JobSeekerJwtStrategy extends PassportStrategy(
  Strategy,
  'jobseeker-jwt',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'local_dev_super_secret_change_me',
    });
  }

  validate(payload: JobSeekerJwtPayload) {
    if (!payload || payload.type !== 'jobseeker') {
      throw new UnauthorizedException('Invalid job seeker token');
    }
    return { id: payload.id, email: payload.email, type: payload.type };
  }
}
