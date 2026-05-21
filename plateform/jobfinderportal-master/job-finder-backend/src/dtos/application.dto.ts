import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  applicantName: string;

  @IsEmail()
  applicantEmail: string;

  @IsString()
  applicantPhone: string;

  @IsString()
  applicantResume: string;

  @IsOptional()
  @IsString()
  coverLetter?: string;
}

export class UpdateApplicationStatusDto {
  @IsString()
  status:
    | 'pending'
    | 'reviewed'
    | 'shortlisted'
    | 'interview_scheduled'
    | 'interview_in_progress'
    | 'interview_completed'
    | 'rejected'
    | 'hired';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  rating?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveAndScheduleDto {
  @IsString()
  interviewType: string;

  @IsDateString()
  scheduledDateTime: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsString()
  meetingLink?: string;
}
