import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export class CreateInterviewDto {
  @IsString()
  type: string;

  @IsDateString()
  scheduledDateTime: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsString()
  meetingLink?: string;
}

export class UpdateInterviewDto {
  @IsOptional()
  @IsString()
  status?: 'scheduled' | 'completed' | 'cancelled' | 'no-show';

  @IsOptional()
  @IsString()
  feedback?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  score?: number;

  @IsOptional()
  @IsString()
  meetingLink?: string;
}
