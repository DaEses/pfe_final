import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JobApplicationService } from './job-application.service';
import { JobSeekerJwtAuthGuard } from '../job-seeker-auth/job-seeker-jwt-auth.guard';
import type { AuthenticatedJobSeekerRequest } from '../../types/authenticated-request';

@Controller('job-applications')
@UseGuards(JobSeekerJwtAuthGuard)
export class JobApplicationController {
  constructor(private readonly jobApplicationService: JobApplicationService) {}

  @Post()
  async createApplication(
    @Body() body: { jobPostingId: string; coverLetter?: string },
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.jobApplicationService.createApplication(
        req.user.id,
        body.jobPostingId,
        body.coverLetter,
      );
      return { success: true, data: result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Application failed';
      return { success: false, message };
    }
  }

  @Get()
  async getMyApplications(@Req() req: AuthenticatedJobSeekerRequest) {
    return this.jobApplicationService.getMyApplications(req.user.id);
  }

  @Get(':id')
  async getApplicationById(
    @Param('id') id: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    const app = await this.jobApplicationService.getApplicationById(
      id,
      req.user.id,
    );
    if (!app) {
      return { success: false, message: 'Application not found' };
    }
    return app;
  }

  @Delete(':id')
  async withdrawApplication(
    @Param('id') id: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.jobApplicationService.withdrawApplication(
        id,
        req.user.id,
      );
      return { success: true, message: 'Application withdrawn', data: result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Withdraw failed';
      return { success: false, message };
    }
  }
}
