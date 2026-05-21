import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { JobPosting } from './job-posting.entity';
import { Interview } from './interview.entity';

@Entity('applications')
@Unique(['applicantEmail', 'jobPostingId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  applicantName: string;

  @Column()
  applicantEmail: string;

  @Column({ nullable: true })
  applicantPhone: string;

  @Column('text', { nullable: true })
  applicantResume: string;

  @Column('text', { nullable: true })
  coverLetter: string;

  @Column({ default: 'pending' })
  status:
    | 'pending'
    | 'reviewed'
    | 'shortlisted'
    | 'interview_scheduled'
    | 'interview_in_progress'
    | 'interview_completed'
    | 'rejected'
    | 'hired';

  @CreateDateColumn()
  appliedAt: Date;

  @Column({ nullable: true })
  rating: number;

  @Column('text', { nullable: true })
  notes: string;

  @ManyToOne(() => JobPosting, (jobPosting) => jobPosting.applications, {
    onDelete: 'CASCADE',
  })
  jobPosting: JobPosting;

  @Column()
  jobPostingId: string;

  @OneToMany(() => Interview, (interview) => interview.application)
  interviews: Interview[];
}
