import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPosting } from '../../entities/job-posting.entity';
import { JobSearchService } from './job-search.service';
import { JobSearchController } from './job-search.controller';

@Module({
  imports: [TypeOrmModule.forFeature([JobPosting])],
  providers: [JobSearchService],
  controllers: [JobSearchController],
  exports: [JobSearchService],
})
export class JobSearchModule {}
