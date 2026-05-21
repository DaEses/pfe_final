import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SavedJobsService } from './saved-jobs.service';
import { JobSeekerJwtAuthGuard } from '../job-seeker-auth/job-seeker-jwt-auth.guard';
import type { AuthenticatedJobSeekerRequest } from '../../types/authenticated-request';

@Controller('saved-jobs')
@UseGuards(JobSeekerJwtAuthGuard)
export class SavedJobsController {
  constructor(private readonly savedJobsService: SavedJobsService) {}

  @Post(':jobPostingId')
  async saveJob(
    @Param('jobPostingId') jobPostingId: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.savedJobsService.saveJob(
        req.user.id,
        jobPostingId,
      );
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      return { success: false, message };
    }
  }

  @Get()
  async getSavedJobs(@Req() req: AuthenticatedJobSeekerRequest) {
    return this.savedJobsService.getSavedJobs(req.user.id);
  }

  @Delete(':jobPostingId')
  async unsaveJob(
    @Param('jobPostingId') jobPostingId: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.savedJobsService.unsaveJob(
        req.user.id,
        jobPostingId,
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unsave failed';
      return { success: false, message };
    }
  }
}
