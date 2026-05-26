import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';

class HRRegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  companyName: string;

  @IsOptional()
  @IsString()
  companyDescription?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  recruiterName?: string;

  @IsOptional()
  @IsString()
  companyRole?: string;

  @IsOptional()
  @IsString()
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  companyLogo?: string;
}

class HRLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: HRRegisterDto) {
    return this.authService.register(
      body.email,
      body.password,
      body.companyName,
      body.companyDescription,
      body.phone,
      body.recruiterName,
      body.companyRole,
      body.companyWebsite,
      body.companyLogo,
    );
  }

  @Post('login')
  login(@Body() body: HRLoginDto) {
    return this.authService.login(body.email, body.password);
  }
}
