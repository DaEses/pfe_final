import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { Interview } from '../../entities/interview.entity';
import { Application } from '../../entities/application.entity';
import { InterviewReport } from '../../entities/interview-report.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { JobSeeker } from '../../entities/job-seeker.entity';
import { JobSeekerAuthModule } from '../job-seeker-auth/job-seeker-auth.module';

@Module({
  imports: [
    JobSeekerAuthModule,
    TypeOrmModule.forFeature([
      Interview,
      Application,
      InterviewReport,
      JobApplication,
      JobSeeker,
    ]),
  ],
  controllers: [InterviewController],
  providers: [InterviewService],
  exports: [InterviewService],
})
export class InterviewModule {}
