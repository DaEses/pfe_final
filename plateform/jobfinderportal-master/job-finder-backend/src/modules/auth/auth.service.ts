import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { HRUserService } from './hr-user.service';

@Injectable()
export class AuthService {
  constructor(
    private hrUserService: HRUserService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.hrUserService.findByEmail(normalizedEmail);

    if (
      !user ||
      !(await this.hrUserService.validatePassword(user.password, password))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        companyName: user.companyName,
      },
    };
  }

  async register(
    email: string,
    password: string,
    companyName: string,
    companyDescription?: string,
    phone?: string,
    recruiterName?: string,
    companyRole?: string,
    companyWebsite?: string,
    companyLogo?: string,
  ) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.hrUserService.register(
      normalizedEmail,
      password,
      companyName,
      companyDescription,
      phone,
      recruiterName,
      companyRole,
      companyWebsite,
      companyLogo,
    );
    const payload = { sub: user.id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        companyName: user.companyName,
        recruiterName: user.recruiterName,
      },
    };
  }
}
