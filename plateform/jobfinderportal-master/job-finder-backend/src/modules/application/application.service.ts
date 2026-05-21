import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application } from '../../entities/application.entity';
import { JobPosting } from '../../entities/job-posting.entity';
import { Interview } from '../../entities/interview.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { JobSeeker } from '../../entities/job-seeker.entity';
import { JobApplicationService } from '../job-application/job-application.service';
import {
  CreateApplicationDto,
  UpdateApplicationStatusDto,
  ApproveAndScheduleDto,
} from '../../dtos/application.dto';

@Injectable()
export class ApplicationService {
  constructor(
    @InjectRepository(Application)
    private applicationRepository: Repository<Application>,
    @InjectRepository(JobPosting)
    private jobPostingRepository: Repository<JobPosting>,
    @InjectRepository(Interview)
    private interviewRepository: Repository<Interview>,
    @InjectRepository(JobApplication)
    private jobApplicationRepository: Repository<JobApplication>,
    @InjectRepository(JobSeeker)
    private jobSeekerRepository: Repository<JobSeeker>,
    private jobApplicationService: JobApplicationService,
  ) {}

  async create(
    jobPostingId: string,
    createApplicationDto: CreateApplicationDto,
  ): Promise<Application> {
    const jobPosting = await this.jobPostingRepository.findOne({
      where: { id: jobPostingId, status: 'active' },
    });

    if (!jobPosting) {
      throw new BadRequestException(
        'Job posting is not active or does not exist',
      );
    }

    // Check if applicant already applied for this job
    const existingApplication = await this.applicationRepository.findOne({
      where: {
        applicantEmail: createApplicationDto.applicantEmail,
        jobPostingId,
      },
    });

    if (existingApplication) {
      throw new BadRequestException('You have already applied for this job');
    }

    const application = this.applicationRepository.create({
      ...createApplicationDto,
      jobPostingId,
    });

    const savedApplication = await this.applicationRepository.save(application);

    // Increment applicant count
    jobPosting.applicantCount += 1;
    await this.jobPostingRepository.save(jobPosting);

    return savedApplication;
  }

  async findAllForJob(
    jobPostingId: string,
    hrUserId: string,
  ): Promise<Application[]> {
    const jobPosting = await this.jobPostingRepository.findOne({
      where: { id: jobPostingId, postedById: hrUserId },
    });

    if (!jobPosting) {
      throw new NotFoundException('Job posting not found');
    }

    await this.jobApplicationService.syncHrBridgeForJob(jobPostingId);

    const applications = await this.applicationRepository.find({
      where: { jobPostingId },
      relations: ['interviews', 'jobPosting'],
      order: { appliedAt: 'DESC' },
    });

    for (const app of applications) {
      const completed = app.interviews?.find(
        (i) => i.status === 'completed' && i.score != null,
      );
      if (completed && (app.rating == null || app.rating === 0)) {
        app.rating = completed.score;
      }
    }

    return applications;
  }

  async findOne(id: string, hrUserId: string): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['jobPosting', 'interviews'],
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    // Verify HR user owns the job posting
    if (application.jobPosting.postedById !== hrUserId) {
      throw new BadRequestException('Unauthorized');
    }

    return application;
  }

  private mapHrStatusToJobSeekerStatus(
    hrStatus: Application['status'],
  ): JobApplication['status'] | null {
    const map: Partial<Record<Application['status'], JobApplication['status']>> = {
      pending: 'applied',
      reviewed: 'reviewing',
      shortlisted: 'shortlisted',
      interview_scheduled: 'interview_scheduled',
      interview_in_progress: 'interview_in_progress',
      interview_completed: 'interview_completed',
      rejected: 'rejected',
      hired: 'accepted',
    };
    return map[hrStatus] ?? null;
  }

  private async syncJobSeekerApplicationStatus(
    application: Application,
  ): Promise<void> {
    const seekerStatus = this.mapHrStatusToJobSeekerStatus(application.status);
    if (!seekerStatus) return;

    const seeker = await this.jobSeekerRepository.findOne({
      where: { email: application.applicantEmail },
    });
    if (!seeker) return;

    const jobSeekerApp = await this.jobApplicationRepository.findOne({
      where: {
        jobSeekerId: seeker.id,
        jobPostingId: application.jobPostingId,
      },
    });
    if (!jobSeekerApp) return;

    jobSeekerApp.status = seekerStatus;
    await this.jobApplicationRepository.save(jobSeekerApp);
  }

  async updateStatus(
    id: string,
    updateDto: UpdateApplicationStatusDto,
    hrUserId: string,
  ): Promise<Application> {
    const application = await this.findOne(id, hrUserId);
    Object.assign(application, updateDto);
    const saved = await this.applicationRepository.save(application);
    await this.syncJobSeekerApplicationStatus(saved);
    return saved;
  }

  async approveAndSchedule(
    id: string,
    dto: ApproveAndScheduleDto,
    hrUserId: string,
  ): Promise<{ application: Application; interview: Interview }> {
    const application = await this.findOne(id, hrUserId);
    application.status = 'interview_scheduled';

    const interview = this.interviewRepository.create({
      applicationId: application.id,
      approverId: hrUserId,
      type: dto.interviewType,
      scheduledDateTime: new Date(dto.scheduledDateTime),
      duration: dto.duration,
      meetingLink: dto.meetingLink,
      status: 'scheduled',
    });

    const seeker = await this.jobSeekerRepository.findOne({
      where: { email: application.applicantEmail },
    });
    if (seeker) {
      const jobSeekerApp = await this.jobApplicationRepository.findOne({
        where: { jobSeekerId: seeker.id, jobPostingId: application.jobPostingId },
      });
      if (jobSeekerApp) {
        jobSeekerApp.status = 'interview_scheduled';
        await this.jobApplicationRepository.save(jobSeekerApp);
      }
    }

    const [savedApplication, savedInterview] = await Promise.all([
      this.applicationRepository.save(application),
      this.interviewRepository.save(interview),
    ]);

    return { application: savedApplication, interview: savedInterview };
  }

  async remove(id: string, hrUserId: string): Promise<void> {
    const application = await this.findOne(id, hrUserId);
    await this.applicationRepository.remove(application);
  }
}
