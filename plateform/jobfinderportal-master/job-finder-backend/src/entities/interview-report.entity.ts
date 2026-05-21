import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Interview } from './interview.entity';
import { Application } from './application.entity';

@Entity('interview_reports')
export class InterviewReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  interviewId: string;

  @Column()
  applicationId: string;

  @Column()
  candidateName: string;

  @Column('jsonb')
  questionsAnswers: Array<{ question: string; answer: string }>;

  @Column('jsonb')
  emotionSummary: Record<string, unknown>;

  @Column('text', { nullable: true })
  finalDecisionHints: string;

  @Column('jsonb', { nullable: true })
  rawArtifacts: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Interview, { onDelete: 'CASCADE' })
  interview: Interview;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  application: Application;
}
