import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { Application } from '../../entities/application.entity';
import { JobPosting } from '../../entities/job-posting.entity';
import { Interview } from '../../entities/interview.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { JobSeeker } from '../../entities/job-seeker.entity';
import { JobApplicationModule } from '../job-application/job-application.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Application,
      JobPosting,
      Interview,
      JobApplication,
      JobSeeker,
    ]),
    JobApplicationModule,
  ],
  controllers: [ApplicationController],
  providers: [ApplicationService],
  exports: [ApplicationService],
})
export class ApplicationModule {}
