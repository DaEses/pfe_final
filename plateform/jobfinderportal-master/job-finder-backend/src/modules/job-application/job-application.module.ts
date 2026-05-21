import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobApplication } from '../../entities/job-application.entity';
import { Application } from '../../entities/application.entity';
import { JobSeeker } from '../../entities/job-seeker.entity';
import { JobPosting } from '../../entities/job-posting.entity';
import { JobApplicationService } from './job-application.service';
import { JobApplicationController } from './job-application.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([JobApplication, Application, JobSeeker, JobPosting]),
  ],
  providers: [JobApplicationService],
  controllers: [JobApplicationController],
  exports: [JobApplicationService],
})
export class JobApplicationModule {}
