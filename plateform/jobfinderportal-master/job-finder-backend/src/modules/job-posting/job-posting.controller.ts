import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JobPostingService } from './job-posting.service';
import {
  CreateJobPostingDto,
  UpdateJobPostingDto,
} from '../../dtos/job-posting.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedHRRequest } from '../../types/authenticated-hr-request';

@Controller('job-postings')
@UseGuards(JwtAuthGuard)
export class JobPostingController {
  constructor(private readonly jobPostingService: JobPostingService) {}

  @Post()
  create(
    @Body() createJobPostingDto: CreateJobPostingDto,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.jobPostingService.create(createJobPostingDto, req.user.id);
  }

  @Get()
  findAll(@Req() req: AuthenticatedHRRequest) {
    return this.jobPostingService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.jobPostingService.findOne(id, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateJobPostingDto: UpdateJobPostingDto,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.jobPostingService.update(
      id,
      updateJobPostingDto,
      req.user.id,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.jobPostingService.remove(id, req.user.id);
  }

  @Get(':id/applicants')
  getApplicants(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.jobPostingService.getApplicants(id, req.user.id);
  }
}
