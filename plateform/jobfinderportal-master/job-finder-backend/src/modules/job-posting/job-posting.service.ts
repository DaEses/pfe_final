import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPosting } from '../../entities/job-posting.entity';
import {
  CreateJobPostingDto,
  UpdateJobPostingDto,
  MAX_JOB_SALARY,
} from '../../dtos/job-posting.dto';
import { JobApplicationService } from '../job-application/job-application.service';

@Injectable()
export class JobPostingService {
  constructor(
    @InjectRepository(JobPosting)
    private jobPostingRepository: Repository<JobPosting>,
    private jobApplicationService: JobApplicationService,
  ) {}

  private assertSalaryInRange(salary?: number): void {
    if (salary == null || Number.isNaN(salary)) return;
    if (salary < 0 || salary > MAX_JOB_SALARY) {
      throw new BadRequestException(
        `Salary must be between 0 and ${MAX_JOB_SALARY.toLocaleString('en-US')}.`,
      );
    }
  }

  async create(
    createJobPostingDto: CreateJobPostingDto,
    hrUserId: string,
  ): Promise<JobPosting> {
    this.assertSalaryInRange(createJobPostingDto.salary);
    const jobPosting = this.jobPostingRepository.create({
      ...createJobPostingDto,
      postedById: hrUserId,
    });
    return this.jobPostingRepository.save(jobPosting);
  }

  async findAll(hrUserId: string): Promise<JobPosting[]> {
    const jobs = await this.jobPostingRepository.find({
      where: { postedById: hrUserId },
      order: { createdAt: 'DESC' },
    });

    for (const job of jobs) {
      await this.jobApplicationService.syncHrBridgeForJob(job.id);
    }

    return this.jobPostingRepository.find({
      where: { postedById: hrUserId },
      relations: ['applications'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, hrUserId: string): Promise<JobPosting> {
    const jobPosting = await this.jobPostingRepository.findOne({
      where: { id, postedById: hrUserId },
      relations: ['applications', 'applications.interviews'],
    });

    if (!jobPosting) {
      throw new NotFoundException(`Job posting with ID ${id} not found`);
    }

    return jobPosting;
  }

  async update(
    id: string,
    updateJobPostingDto: UpdateJobPostingDto,
    hrUserId: string,
  ): Promise<JobPosting> {
    const jobPosting = await this.findOne(id, hrUserId);
    this.assertSalaryInRange(updateJobPostingDto.salary);
    Object.assign(jobPosting, updateJobPostingDto);
    return this.jobPostingRepository.save(jobPosting);
  }

  async remove(id: string, hrUserId: string): Promise<void> {
    const jobPosting = await this.findOne(id, hrUserId);
    await this.jobPostingRepository.remove(jobPosting);
  }

  async getApplicants(jobPostingId: string, hrUserId: string) {
    const jobPosting = await this.findOne(jobPostingId, hrUserId);
    return jobPosting.applications;
  }
}
