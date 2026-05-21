import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedJob } from '../../entities/saved-job.entity';

@Injectable()
export class SavedJobsService {
  constructor(
    @InjectRepository(SavedJob)
    private savedJobRepository: Repository<SavedJob>,
  ) {}

  async saveJob(jobSeekerId: string, jobPostingId: string) {
    const existing = await this.savedJobRepository.findOne({
      where: { jobSeekerId, jobPostingId },
    });

    if (existing) {
      return { success: false, message: 'Job already saved' };
    }

    const saved = this.savedJobRepository.create({ jobSeekerId, jobPostingId });
    return this.savedJobRepository.save(saved);
  }

  async getSavedJobs(jobSeekerId: string) {
    return this.savedJobRepository.find({
      where: { jobSeekerId },
      relations: ['jobPosting', 'jobPosting.postedBy'],
      order: { savedAt: 'DESC' },
    });
  }

  async unsaveJob(jobSeekerId: string, jobPostingId: string) {
    const saved = await this.savedJobRepository.findOne({
      where: { jobSeekerId, jobPostingId },
    });

    if (!saved) {
      throw new Error('Saved job not found');
    }

    await this.savedJobRepository.delete(saved.id);
    return { success: true, message: 'Job removed from saved' };
  }
}
