import { Controller, Get, Param, Query } from '@nestjs/common';
import { JobSearchService } from './job-search.service';

@Controller('jobs')
export class JobSearchController {
  constructor(private readonly jobSearchService: JobSearchService) {}

  @Get()
  async findAll(
    @Query('location') location?: string,
    @Query('minSalary') minSalary?: string,
    @Query('maxSalary') maxSalary?: string,
  ) {
    const filters = {
      location,
      minSalary: minSalary ? parseInt(minSalary) : undefined,
      maxSalary: maxSalary ? parseInt(maxSalary) : undefined,
    };
    return this.jobSearchService.findAllActive(filters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const job = await this.jobSearchService.findById(id);
    if (!job) {
      return { success: false, message: 'Job not found' };
    }
    return job;
  }
}
