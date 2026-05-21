import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobSeeker } from '../../entities/job-seeker.entity';
import { JobSeekerProfileService } from './job-seeker-profile.service';
import { JobSeekerProfileController } from './job-seeker-profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([JobSeeker])],
  providers: [JobSeekerProfileService],
  controllers: [JobSeekerProfileController],
  exports: [JobSeekerProfileService],
})
export class JobSeekerProfileModule {}
