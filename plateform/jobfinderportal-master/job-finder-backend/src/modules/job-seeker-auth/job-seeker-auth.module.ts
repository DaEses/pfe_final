import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JobSeeker } from '../../entities/job-seeker.entity';
import { JobSeekerAuthService } from './job-seeker-auth.service';
import { JobSeekerAuthController } from './job-seeker-auth.controller';
import { JobSeekerJwtStrategy } from './job-seeker-jwt.strategy';
import { JobSeekerJwtAuthGuard } from './job-seeker-jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobSeeker]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:
          process.env.JWT_SECRET || 'local_dev_super_secret_change_me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [JobSeekerAuthService, JobSeekerJwtStrategy, JobSeekerJwtAuthGuard],
  controllers: [JobSeekerAuthController],
  exports: [JobSeekerAuthService, JobSeekerJwtStrategy, JobSeekerJwtAuthGuard],
})
export class JobSeekerAuthModule {}
