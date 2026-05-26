import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JobApplication } from '../../entities/job-application.entity';
import { Application } from '../../entities/application.entity';
import { JobSeeker } from '../../entities/job-seeker.entity';
import { JobPosting } from '../../entities/job-posting.entity';

@Injectable()
export class JobApplicationService {
  constructor(
    @InjectRepository(JobApplication)
    private jobApplicationRepository: Repository<JobApplication>,
    @InjectRepository(Application)
    private applicationRepository: Repository<Application>,
    @InjectRepository(JobSeeker)
    private jobSeekerRepository: Repository<JobSeeker>,
    @InjectRepository(JobPosting)
    private jobPostingRepository: Repository<JobPosting>,
  ) {}

  async createApplication(
    jobSeekerId: string,
    jobPostingId: string,
    coverLetter?: string,
    applicantResume?: string,
  ) {
    const existingApp = await this.jobApplicationRepository.findOne({
      where: { jobSeekerId, jobPostingId },
    });

    if (existingApp) {
      throw new BadRequestException('You have already applied for this job');
    }

    const app = this.jobApplicationRepository.create({
      jobSeekerId,
      jobPostingId,
      coverLetter,
      status: 'applied',
    });

    const savedApp = await this.jobApplicationRepository.save(app);

    // Bridge: also create an Application record so HR can see this candidate
    const seeker = await this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });

    if (seeker) {
      const existingHRApp = await this.applicationRepository.findOne({
        where: { applicantEmail: seeker.email, jobPostingId },
      });

      if (!existingHRApp) {
        const hrApp = this.applicationRepository.create({
          applicantName: `${seeker.firstName} ${seeker.lastName}`,
          applicantEmail: seeker.email,
          applicantPhone: seeker.phone || '',
          applicantResume: applicantResume || '',
          jobPostingId,
          coverLetter: coverLetter || undefined,
          status: 'pending',
        });
        await this.applicationRepository.save(hrApp);

        const jobPosting = await this.jobPostingRepository.findOne({
          where: { id: jobPostingId },
        });
        if (jobPosting) {
          jobPosting.applicantCount += 1;
          await this.jobPostingRepository.save(jobPosting);
        }
      }
    }

    return savedApp;
  }

  /** Backfill HR `applications` rows from existing `job_applications` (e.g. pre-bridge applies). */
  async syncHrBridgeForJob(jobPostingId: string): Promise<void> {
    const jobApps = await this.jobApplicationRepository.find({
      where: { jobPostingId },
      relations: ['jobSeeker'],
    });

    for (const jobApp of jobApps) {
      const seeker = jobApp.jobSeeker;
      if (!seeker) continue;

      const existing = await this.applicationRepository.findOne({
        where: { applicantEmail: seeker.email, jobPostingId },
      });

      if (existing) continue;

      const hrApp = this.applicationRepository.create({
        applicantName: `${seeker.firstName} ${seeker.lastName}`.trim(),
        applicantEmail: seeker.email,
        applicantPhone: seeker.phone || '',
        jobPostingId,
        coverLetter: jobApp.coverLetter || undefined,
        status:
          jobApp.status === 'interview_scheduled' ||
          jobApp.status === 'interview_in_progress' ||
          jobApp.status === 'interview_completed'
            ? jobApp.status
            : 'pending',
      });
      await this.applicationRepository.save(hrApp);
    }

    const count = await this.applicationRepository.count({
      where: { jobPostingId },
    });
    await this.jobPostingRepository.update(jobPostingId, {
      applicantCount: count,
    });
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

  async getMyApplications(jobSeekerId: string) {
    const apps = await this.jobApplicationRepository.find({
      where: { jobSeekerId },
      relations: ['jobPosting', 'jobPosting.postedBy'],
      order: { appliedAt: 'DESC' },
    });

    const seeker = await this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });
    if (!seeker || apps.length === 0) return apps;

    const postingIds = apps.map((a) => a.jobPostingId);
    const hrApps = await this.applicationRepository.find({
      where: {
        applicantEmail: seeker.email,
        jobPostingId: In(postingIds),
      },
    });
    const hrByPosting = new Map(hrApps.map((h) => [h.jobPostingId, h]));

    const toUpdate: JobApplication[] = [];
    for (const app of apps) {
      const hrApp = hrByPosting.get(app.jobPostingId);
      if (!hrApp) continue;
      const mapped = this.mapHrStatusToJobSeekerStatus(hrApp.status);
      if (mapped && app.status !== mapped) {
        app.status = mapped;
        toUpdate.push(app);
      }
    }
    if (toUpdate.length > 0) {
      await this.jobApplicationRepository.save(toUpdate);
    }

    return apps;
  }

  async getApplicationById(id: string, jobSeekerId: string) {
    return this.jobApplicationRepository.findOne({
      where: { id, jobSeekerId },
      relations: ['jobPosting', 'jobPosting.postedBy'],
    });
  }

  async withdrawApplication(id: string, jobSeekerId: string) {
    const app = await this.getApplicationById(id, jobSeekerId);
    if (!app) {
      throw new BadRequestException('Application not found');
    }

    app.status = 'withdrawn';
    return this.jobApplicationRepository.save(app);
  }
}
