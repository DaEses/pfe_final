import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { JobPostingModule } from './modules/job-posting/job-posting.module';
import { ApplicationModule } from './modules/application/application.module';
import { InterviewModule } from './modules/interview/interview.module';
import { JobSeekerAuthModule } from './modules/job-seeker-auth/job-seeker-auth.module';
import { JobSearchModule } from './modules/job-search/job-search.module';
import { JobApplicationModule } from './modules/job-application/job-application.module';
import { SavedJobsModule } from './modules/saved-jobs/saved-jobs.module';
import { JobSeekerProfileModule } from './modules/job-seeker-profile/job-seeker-profile.module';
import { HRUser } from './entities/hr-user.entity';
import { JobPosting } from './entities/job-posting.entity';
import { Application } from './entities/application.entity';
import { Interview } from './entities/interview.entity';
import { JobSeeker } from './entities/job-seeker.entity';
import { JobApplication } from './entities/job-application.entity';
import { SavedJob } from './entities/saved-job.entity';
import { InterviewReport } from './entities/interview-report.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'job_finder',
      entities: [
        HRUser,
        JobPosting,
        Application,
        Interview,
        JobSeeker,
        JobApplication,
        SavedJob,
        InterviewReport,
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV !== 'production',
    }),
    AuthModule,
    JobPostingModule,
    ApplicationModule,
    InterviewModule,
    JobSeekerAuthModule,
    JobSearchModule,
    JobApplicationModule,
    SavedJobsModule,
    JobSeekerProfileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
