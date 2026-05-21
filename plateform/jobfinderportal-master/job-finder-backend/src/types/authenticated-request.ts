import { Request } from 'express';

export interface JobSeekerUser {
  id: string;
  email: string;
  type: string;
}

export interface AuthenticatedJobSeekerRequest extends Request {
  user: JobSeekerUser;
}
