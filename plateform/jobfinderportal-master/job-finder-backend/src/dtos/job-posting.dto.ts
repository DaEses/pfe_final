import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

/** Matches DB column decimal(10,2): max 99_999_999.99 */
export const MAX_JOB_SALARY = 99_999_999;

export class CreateJobPostingDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  position: string;

  @IsString()
  location: string;

  @IsOptional()
  @IsString()
  requirements?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_JOB_SALARY)
  salary?: number;

  @IsOptional()
  @IsString()
  status?: 'active' | 'draft';
}

export class UpdateJobPostingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  requirements?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_JOB_SALARY)
  salary?: number;

  @IsOptional()
  @IsString()
  status?: 'active' | 'closed' | 'draft';
}
