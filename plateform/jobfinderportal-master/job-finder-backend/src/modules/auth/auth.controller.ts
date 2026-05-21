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
    );
  }

  @Post('login')
  login(@Body() body: HRLoginDto) {
    return this.authService.login(body.email, body.password);
  }
}
