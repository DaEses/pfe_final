import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobApplication } from './job-application.entity';
import { SavedJob } from './saved-job.entity';

@Entity('job_seekers')
export class JobSeeker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone: string;

  @Column('text', { nullable: true })
  bio: string;

  @Column({ nullable: true })
  profilePicture: string;

  @Column('text', { nullable: true })
  resume: string;

  @Column('simple-array', { default: () => "''" })
  skills: string[];

  @Column('json', { nullable: true })
  workExperience: Array<{
    id?: string;
    company: string;
    position: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;

  @Column('json', { nullable: true })
  education: Array<{
    id?: string;
    school: string;
    degree: string;
    field: string;
    graduationYear: number;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => JobApplication, (app) => app.jobSeeker, {
    cascade: true,
  })
  applications: JobApplication[];

  @OneToMany(() => SavedJob, (saved) => saved.jobSeeker, { cascade: true })
  savedJobs: SavedJob[];
}
