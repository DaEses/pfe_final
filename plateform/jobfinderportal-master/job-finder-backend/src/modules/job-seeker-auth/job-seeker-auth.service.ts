import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { JobSeeker } from '../../entities/job-seeker.entity';
import {
  RegisterJobSeekerDto,
  LoginJobSeekerDto,
} from '../../dtos/job-seeker.dto';

@Injectable()
export class JobSeekerAuthService {
  constructor(
    @InjectRepository(JobSeeker)
    private jobSeekerRepository: Repository<JobSeeker>,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterJobSeekerDto) {
    const { email, password, firstName, lastName, phone, bio, skills } =
      registerDto;
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.jobSeekerRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const jobSeeker = this.jobSeekerRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      firstName,
      lastName,
      phone: phone ?? '',
      bio: bio ?? '',
      skills: skills ?? [],
      workExperience: [],
      education: [],
    });

    const saved = await this.jobSeekerRepository.save(jobSeeker);

    const token = this.jwtService.sign(
      { id: saved.id, email: saved.email, type: 'jobseeker' },
      { expiresIn: '7d' },
    );

    return {
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: saved.id,
        email: saved.email,
        firstName: saved.firstName,
        lastName: saved.lastName,
      },
    };
  }

  async login(loginDto: LoginJobSeekerDto) {
    const { email, password } = loginDto;
    const normalizedEmail = email.toLowerCase().trim();

    const jobSeeker = await this.jobSeekerRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (!jobSeeker) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = await bcrypt.compare(password, jobSeeker.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.jwtService.sign(
      { id: jobSeeker.id, email: jobSeeker.email, type: 'jobseeker' },
      { expiresIn: '7d' },
    );

    return {
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: jobSeeker.id,
        email: jobSeeker.email,
        firstName: jobSeeker.firstName,
        lastName: jobSeeker.lastName,
      },
    };
  }
}
