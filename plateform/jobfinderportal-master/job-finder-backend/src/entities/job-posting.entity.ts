import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HRUser } from './hr-user.entity';
import { Application } from './application.entity';
import { JobApplication } from './job-application.entity';
import { SavedJob } from './saved-job.entity';

@Entity('job_postings')
export class JobPosting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column('text', { nullable: true })
  requirements: string;

  @Column()
  position: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  salary: number;

  @Column()
  location: string;

  @Column({ default: 'active' })
  status: 'active' | 'closed' | 'draft';

  @Column({ default: 0 })
  applicantCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => HRUser, (hrUser) => hrUser.jobPostings, {
    onDelete: 'CASCADE',
  })
  postedBy: HRUser;

  @Column()
  postedById: string;

  @OneToMany(() => Application, (application) => application.jobPosting)
  applications: Application[];

  @OneToMany(() => JobApplication, (jobApp) => jobApp.jobPosting)
  jobApplications: JobApplication[];

  @OneToMany(() => SavedJob, (saved) => saved.jobPosting)
  savedJobs: SavedJob[];
}
