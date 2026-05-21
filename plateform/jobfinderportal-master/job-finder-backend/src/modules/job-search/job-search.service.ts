import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPosting } from '../../entities/job-posting.entity';

@Injectable()
export class JobSearchService {
  constructor(
    @InjectRepository(JobPosting)
    private jobPostingRepository: Repository<JobPosting>,
  ) {}

  async findAllActive(filters?: {
    location?: string;
    minSalary?: number;
    maxSalary?: number;
  }) {
    const query = this.jobPostingRepository
      .createQueryBuilder('job')
      .where('job.status = :status', { status: 'active' })
      .orderBy('job.createdAt', 'DESC');

    if (filters?.location) {
      query.andWhere('LOWER(job.location) LIKE LOWER(:location)', {
        location: `%${filters.location}%`,
      });
    }

    if (filters?.minSalary) {
      query.andWhere('job.salary >= :minSalary', {
        minSalary: filters.minSalary,
      });
    }

    if (filters?.maxSalary) {
      query.andWhere('job.salary <= :maxSalary', {
        maxSalary: filters.maxSalary,
      });
    }

    return query.getMany();
  }

  async findById(id: string) {
    return this.jobPostingRepository.findOne({
      where: { id },
      relations: ['postedBy'],
    });
  }
}
