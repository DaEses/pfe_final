import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPostingController } from './job-posting.controller';
import { JobPostingService } from './job-posting.service';
import { JobPosting } from '../../entities/job-posting.entity';
import { JobApplicationModule } from '../job-application/job-application.module';

@Module({
  imports: [TypeOrmModule.forFeature([JobPosting]), JobApplicationModule],
  controllers: [JobPostingController],
  providers: [JobPostingService],
  exports: [JobPostingService],
})
export class JobPostingModule {}
