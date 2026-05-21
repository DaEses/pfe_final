import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { JobSeeker } from './job-seeker.entity';
import { JobPosting } from './job-posting.entity';

@Entity('saved_jobs')
@Unique(['jobSeekerId', 'jobPostingId'])
export class SavedJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobSeekerId: string;

  @Column()
  jobPostingId: string;

  @CreateDateColumn()
  savedAt: Date;

  @ManyToOne(() => JobSeeker, (seeker) => seeker.savedJobs, {
    onDelete: 'CASCADE',
  })
  jobSeeker: JobSeeker;

  @ManyToOne(() => JobPosting, (posting) => posting.savedJobs, {
    onDelete: 'CASCADE',
  })
  jobPosting: JobPosting;
}
