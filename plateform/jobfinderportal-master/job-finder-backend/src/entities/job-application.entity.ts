import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobSeeker } from './job-seeker.entity';
import { JobPosting } from './job-posting.entity';

@Entity('job_applications')
export class JobApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobSeekerId: string;

  @Column()
  jobPostingId: string;

  @Column({ default: 'applied' })
  status:
    | 'applied'
    | 'reviewing'
    | 'shortlisted'
    | 'interview_scheduled'
    | 'interview_in_progress'
    | 'interview_completed'
    | 'rejected'
    | 'accepted'
    | 'withdrawn';

  @Column('text', { nullable: true })
  coverLetter: string;

  @CreateDateColumn()
  appliedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => JobSeeker, (seeker) => seeker.applications, {
    onDelete: 'CASCADE',
  })
  jobSeeker: JobSeeker;

  @ManyToOne(() => JobPosting, (posting) => posting.jobApplications, {
    onDelete: 'CASCADE',
  })
  jobPosting: JobPosting;
}
