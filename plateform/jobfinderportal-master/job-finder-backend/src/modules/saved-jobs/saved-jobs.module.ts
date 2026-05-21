import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedJob } from '../../entities/saved-job.entity';
import { SavedJobsService } from './saved-jobs.service';
import { SavedJobsController } from './saved-jobs.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SavedJob])],
  providers: [SavedJobsService],
  controllers: [SavedJobsController],
  exports: [SavedJobsService],
})
export class SavedJobsModule {}
