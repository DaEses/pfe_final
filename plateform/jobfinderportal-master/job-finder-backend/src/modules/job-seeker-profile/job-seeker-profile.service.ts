import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobSeeker } from '../../entities/job-seeker.entity';

@Injectable()
export class JobSeekerProfileService {
  constructor(
    @InjectRepository(JobSeeker)
    private jobSeekerRepository: Repository<JobSeeker>,
  ) {}

  async getProfile(jobSeekerId: string) {
    return this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });
  }

  async updateProfile(jobSeekerId: string, updateDto: any) {
    const { firstName, lastName, phone, bio, profilePicture, resume, skills } =
      updateDto;

    const seeker = await this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });

    if (!seeker) {
      throw new Error('User not found');
    }

    seeker.firstName = firstName || seeker.firstName;
    seeker.lastName = lastName || seeker.lastName;
    seeker.phone = phone || seeker.phone;
    seeker.bio = bio || seeker.bio;
    seeker.profilePicture = profilePicture || seeker.profilePicture;
    seeker.resume = resume || seeker.resume;
    seeker.skills = skills || seeker.skills;

    return this.jobSeekerRepository.save(seeker);
  }

  async addWorkExperience(jobSeekerId: string, workExp: any) {
    const seeker = await this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });

    if (!seeker) {
      throw new Error('User not found');
    }

    if (!seeker.workExperience) {
      seeker.workExperience = [];
    }

    seeker.workExperience.push({ ...workExp, id: Date.now().toString() });
    return this.jobSeekerRepository.save(seeker);
  }

  async addEducation(jobSeekerId: string, education: any) {
    const seeker = await this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });

    if (!seeker) {
      throw new Error('User not found');
    }

    if (!seeker.education) {
      seeker.education = [];
    }

    seeker.education.push({ ...education, id: Date.now().toString() });
    return this.jobSeekerRepository.save(seeker);
  }

  async deleteWorkExperience(jobSeekerId: string, expId: string) {
    const seeker = await this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });

    if (!seeker) {
      throw new Error('User not found');
    }

    seeker.workExperience =
      seeker.workExperience?.filter((exp) => exp.id !== expId) || [];
    return this.jobSeekerRepository.save(seeker);
  }

  async deleteEducation(jobSeekerId: string, eduId: string) {
    const seeker = await this.jobSeekerRepository.findOne({
      where: { id: jobSeekerId },
    });

    if (!seeker) {
      throw new Error('User not found');
    }

    seeker.education =
      seeker.education?.filter((edu) => edu.id !== eduId) || [];
    return this.jobSeekerRepository.save(seeker);
  }
}
