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
import { ApplicationService } from './application.service';
import {
  CreateApplicationDto,
  UpdateApplicationStatusDto,
  ApproveAndScheduleDto,
} from '../../dtos/application.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedHRRequest } from '../../types/authenticated-hr-request';

@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post(':jobPostingId')
  create(
    @Param('jobPostingId') jobPostingId: string,
    @Body() createApplicationDto: CreateApplicationDto,
  ) {
    return this.applicationService.create(jobPostingId, createApplicationDto);
  }

  @Get('job/:jobPostingId')
  @UseGuards(JwtAuthGuard)
  findAllForJob(
    @Param('jobPostingId') jobPostingId: string,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.applicationService.findAllForJob(jobPostingId, req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.applicationService.findOne(id, req.user.id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateApplicationStatusDto,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.applicationService.updateStatus(id, updateDto, req.user.id);
  }

  @Post(':id/approve-and-schedule')
  @UseGuards(JwtAuthGuard)
  approveAndSchedule(
    @Param('id') id: string,
    @Body() dto: ApproveAndScheduleDto,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.applicationService.approveAndSchedule(id, dto, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.applicationService.remove(id, req.user.id);
  }
}
