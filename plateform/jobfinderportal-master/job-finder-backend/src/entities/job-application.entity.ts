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

  // Stored as a base64 data URL (e.g. "data:application/pdf;base64,...") or plain text.
  // HR uses the bridged `Application.applicantResume`, but keeping it here as well
  // makes reconnect/backfills reliable.
  @Column('text', { nullable: true })
  applicantResume: string | null;

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
