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
import { InterviewService } from './interview.service';
import {
  CreateInterviewDto,
  UpdateInterviewDto,
} from '../../dtos/interview.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobSeekerJwtAuthGuard } from '../job-seeker-auth/job-seeker-jwt-auth.guard';
import type { AuthenticatedHRRequest } from '../../types/authenticated-hr-request';
import type { AuthenticatedJobSeekerRequest } from '../../types/authenticated-request';

@Controller('interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  /* ── Candidate routes (must be before :id / :applicationId params) ── */

  @Post('candidate/begin')
  @UseGuards(JobSeekerJwtAuthGuard)
  beginCandidateSession(
    @Body('jobPostingId') jobPostingId: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    return this.interviewService.beginCandidateSession(
      req.user.email,
      jobPostingId,
    );
  }

  @Post('candidate/launch')
  launchFromCandidateSite(
    @Body('applicantEmail') applicantEmail: string,
    @Body('jobPostingId') jobPostingId: string,
  ) {
    return this.interviewService.completeAndGenerateReportByCandidate(
      applicantEmail,
      jobPostingId,
    );
  }

  @Post('candidate/:interviewId/emotion-frame')
  @UseGuards(JobSeekerJwtAuthGuard)
  ingestEmotionFrame(
    @Param('interviewId') interviewId: string,
    @Body('imageBase64') imageBase64: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    return this.interviewService.ingestEmotionFrame(
      interviewId,
      req.user.email,
      imageBase64,
    );
  }

  @Get('candidate/:interviewId/emotion-status')
  @UseGuards(JobSeekerJwtAuthGuard)
  getEmotionStatus(
    @Param('interviewId') interviewId: string,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    return this.interviewService
      .assertCandidateInterview(interviewId, req.user.email)
      .then(() => this.interviewService.getEmotionSessionStatus(interviewId));
  }

  @Post('candidate/:interviewId/finish')
  @UseGuards(JobSeekerJwtAuthGuard)
  finishCandidateSession(
    @Param('interviewId') interviewId: string,
    @Body('questionsAnswers')
    questionsAnswers: Array<{ question: string; answer: string }>,
    @Req() req: AuthenticatedJobSeekerRequest,
  ) {
    return this.interviewService.finishCandidateSession(
      interviewId,
      req.user.email,
      questionsAnswers,
    );
  }

  @Post('candidate/:id/start')
  startByCandidate(
    @Param('id') id: string,
    @Body('applicantEmail') applicantEmail: string,
  ) {
    return this.interviewService.startInterviewByCandidate(id, applicantEmail);
  }

  /* ── HR routes ── */

  @Get('upcoming')
  @UseGuards(JwtAuthGuard)
  getUpcomingInterviews(@Req() req: AuthenticatedHRRequest) {
    return this.interviewService.getUpcomingInterviews(req.user.id);
  }

  @Get('application/:applicationId')
  @UseGuards(JwtAuthGuard)
  findByApplicationId(
    @Param('applicationId') applicationId: string,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.interviewService.findByApplicationId(
      applicationId,
      req.user.id,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAllScheduled(@Req() req: AuthenticatedHRRequest) {
    return this.interviewService.findAllScheduledInterviews(req.user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  createFromBody(
    @Body('applicationId') applicationId: string,
    @Body() createInterviewDto: CreateInterviewDto,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.interviewService.create(
      applicationId,
      createInterviewDto,
      req.user.id,
    );
  }

  @Post(':applicationId')
  @UseGuards(JwtAuthGuard)
  create(
    @Param('applicationId') applicationId: string,
    @Body() createInterviewDto: CreateInterviewDto,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.interviewService.create(
      applicationId,
      createInterviewDto,
      req.user.id,
    );
  }

  @Get(':id/report')
  @UseGuards(JwtAuthGuard)
  getReport(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.interviewService.getReport(id, req.user.id);
  }

  @Post(':id/complete-and-generate-report')
  @UseGuards(JwtAuthGuard)
  completeAndGenerateReport(
    @Param('id') id: string,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.interviewService.completeAndGenerateReport(id, req.user.id);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard)
  start(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.interviewService.startInterview(id, req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.interviewService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateInterviewDto: UpdateInterviewDto,
    @Req() req: AuthenticatedHRRequest,
  ) {
    return this.interviewService.update(
      id,
      updateInterviewDto,
      req.user.id,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() req: AuthenticatedHRRequest) {
    return this.interviewService.remove(id, req.user.id);
  }
}
