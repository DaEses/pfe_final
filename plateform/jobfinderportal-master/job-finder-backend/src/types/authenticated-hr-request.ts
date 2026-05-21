import { Request } from 'express';
import { HRUser } from '../entities/hr-user.entity';

export interface AuthenticatedHRRequest extends Request {
  user: HRUser;
}
