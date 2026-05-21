import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JobSeekerProfileService } from './job-seeker-profile.service';
import { JobSeekerJwtAuthGuard } from '../job-seeker-auth/job-seeker-jwt-auth.guard';
import type { AuthenticatedJobSeekerRequest } from '../../types/authenticated-request';

@Controller('job-seeker/profile')
@UseGuards(JobSeekerJwtAuthGuard)
export class JobSeekerProfileController {
  constructor(private readonly profileService: JobSeekerProfileService) {}

  @Get()
  async getProfile(@Req() req: AuthenticatedJobSeekerRequest) {
    return this.profileService.getProfile(req.user.id);
  }

  @Patch()
  async updateProfile(
    @Body() updateDto: Record<string, unknown>,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.profileService.updateProfile(
        req.user.id,
        updateDto,
      );
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      return { success: false, message };
    }
  }

  @Post('work-experience')
  async addWorkExperience(
    @Body() workExp: Record<string, unknown>,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.profileService.addWorkExperience(
        req.user.id,
        workExp,
      );
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Add failed';
      return { success: false, message };
    }
  }

  @Delete('work-experience/:id')
  async deleteWorkExperience(
    @Param('id') id: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.profileService.deleteWorkExperience(
        req.user.id,
        id,
      );
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      return { success: false, message };
    }
  }

  @Post('education')
  async addEducation(
    @Body() education: Record<string, unknown>,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.profileService.addEducation(
        req.user.id,
        education,
      );
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Add failed';
      return { success: false, message };
    }
  }

  @Delete('education/:id')
  async deleteEducation(
    @Param('id') id: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    try {
      const result = await this.profileService.deleteEducation(
        req.user.id,
        id,
      );
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Delete failed';
      return { success: false, message };
    }
  }
}
