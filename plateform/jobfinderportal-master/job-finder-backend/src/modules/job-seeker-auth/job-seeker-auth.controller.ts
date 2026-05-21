import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { JobSeekerAuthService } from './job-seeker-auth.service';
import {
  RegisterJobSeekerDto,
  LoginJobSeekerDto,
} from '../../dtos/job-seeker.dto';

@Controller('auth/job-seeker')
export class JobSeekerAuthController {
  constructor(private readonly authService: JobSeekerAuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterJobSeekerDto) {
    try {
      return await this.authService.register(registerDto);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Registration failed';
      return { success: false, message };
    }
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginJobSeekerDto) {
    try {
      return await this.authService.login(loginDto);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      return { success: false, message };
    }
  }
}
