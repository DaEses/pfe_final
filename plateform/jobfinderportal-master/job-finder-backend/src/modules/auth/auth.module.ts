import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HRUserService } from './hr-user.service';
import { JwtStrategy } from './jwt.strategy';
import { HRUser } from '../../entities/hr-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HRUser]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:
          process.env.JWT_SECRET || 'local_dev_super_secret_change_me',
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, HRUserService, JwtStrategy],
  exports: [HRUserService],
})
export class AuthModule {}
