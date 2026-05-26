import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { JobPosting } from './job-posting.entity';
import { Interview } from './interview.entity';

@Entity('hr_users')
export class HRUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  companyName: string;

  @Column({ nullable: true })
  companyDescription: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  recruiterName: string;

  @Column({ nullable: true })
  companyRole: string;

  @Column({ nullable: true })
  companyWebsite: string;

  @Column({ nullable: true })
  companyLogo: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => JobPosting, (jobPosting) => jobPosting.postedBy)
  jobPostings: JobPosting[];

  @OneToMany(() => Interview, (interview) => interview.approver)
  facilitatedInterviews: Interview[];
}
