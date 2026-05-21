import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Application } from './application.entity';
import { HRUser } from './hr-user.entity';

@Entity('interviews')
export class Interview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  type: string; // e.g., "Phone", "Video", "In-person"

  @Column()
  scheduledDateTime: Date;

  @Column({ nullable: true })
  duration: number; // in minutes

  @Column({ default: 'scheduled' })
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';

  @Column('text', { nullable: true })
  feedback: string;

  @Column({ nullable: true })
  score: number; // 1-10 rating

  @Column('text', { nullable: true })
  meetingLink: string; // for virtual interviews

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Application, (application) => application.interviews, {
    onDelete: 'CASCADE',
  })
  application: Application;

  @Column()
  applicationId: string;

  @ManyToOne(() => HRUser, (hrUser) => hrUser.facilitatedInterviews)
  approver: HRUser;

  @Column()
  approverId: string;
}
