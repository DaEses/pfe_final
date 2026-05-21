import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HRUser } from '../../entities/hr-user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class HRUserService {
  constructor(
    @InjectRepository(HRUser)
    private hrUserRepository: Repository<HRUser>,
  ) {}

  async register(
    email: string,
    password: string,
    companyName: string,
  ): Promise<HRUser> {
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await this.hrUserRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const hrUser = this.hrUserRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      companyName,
    });

    return this.hrUserRepository.save(hrUser);
  }

  async findByEmail(email: string): Promise<HRUser | null> {
    const normalizedEmail = email.toLowerCase().trim();
    return this.hrUserRepository.findOne({ where: { email: normalizedEmail } });
  }

  async findById(id: string): Promise<HRUser | null> {
    return this.hrUserRepository.findOne({ where: { id } });
  }

  async validatePassword(
    storedPassword: string,
    providedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(providedPassword, storedPassword);
  }
}
