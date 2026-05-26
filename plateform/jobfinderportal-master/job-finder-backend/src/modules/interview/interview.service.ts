import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { execFile, spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { Interview } from '../../entities/interview.entity';
import { Application } from '../../entities/application.entity';
import { InterviewReport } from '../../entities/interview-report.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { JobSeeker } from '../../entities/job-seeker.entity';
import {
  CreateInterviewDto,
  UpdateInterviewDto,
} from '../../dtos/interview.dto';

const execFileAsync = promisify(execFile);

type EmotionWorkerHandle = {
  proc: ChildProcess;
  waiters: Array<(value: Record<string, unknown>) => void>;
  rejecters: Array<(err: Error) => void>;
};

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);
  private readonly emotionWorkers = new Map<string, EmotionWorkerHandle>();
  private readonly emotionLiveState = new Map<
    string,
    Record<string, unknown>
  >();

  constructor(
    @InjectRepository(Interview)
    private interviewRepository: Repository<Interview>,
    @InjectRepository(Application)
    private applicationRepository: Repository<Application>,
    @InjectRepository(InterviewReport)
    private reportRepository: Repository<InterviewReport>,
    @InjectRepository(JobApplication)
    private jobApplicationRepository: Repository<JobApplication>,
    @InjectRepository(JobSeeker)
    private jobSeekerRepository: Repository<JobSeeker>,
  ) {}

  async create(
    applicationId: string,
    createInterviewDto: CreateInterviewDto,
    hrUserId: string,
  ): Promise<Interview> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['jobPosting'],
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.jobPosting.postedById !== hrUserId) {
      throw new BadRequestException('Unauthorized');
    }

    const interview = this.interviewRepository.create({
      ...createInterviewDto,
      applicationId,
      approverId: hrUserId,
      scheduledDateTime: new Date(createInterviewDto.scheduledDateTime),
    });

    return this.interviewRepository.save(interview);
  }

  async findAllScheduledInterviews(hrUserId: string): Promise<Interview[]> {
    return this.interviewRepository.find({
      where: { approverId: hrUserId },
      relations: ['application', 'application.jobPosting'],
      order: { scheduledDateTime: 'ASC' },
    });
  }

  async findByApplicationId(
    applicationId: string,
    hrUserId: string,
  ): Promise<Interview[]> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['jobPosting'],
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    if (application.jobPosting.postedById !== hrUserId) {
      throw new BadRequestException('Unauthorized');
    }

    return this.interviewRepository.find({
      where: { applicationId },
      order: { scheduledDateTime: 'ASC' },
    });
  }

  async findOne(id: string, hrUserId: string): Promise<Interview> {
    const interview = await this.interviewRepository.findOne({
      where: { id },
      relations: ['application', 'application.jobPosting'],
    });

    if (!interview) {
      throw new NotFoundException(`Interview with ID ${id} not found`);
    }

    if (interview.application.jobPosting.postedById !== hrUserId) {
      throw new BadRequestException('Unauthorized');
    }

    return interview;
  }

  async update(
    id: string,
    updateInterviewDto: UpdateInterviewDto,
    hrUserId: string,
  ): Promise<Interview> {
    const interview = await this.findOne(id, hrUserId);
    Object.assign(interview, updateInterviewDto);
    return this.interviewRepository.save(interview);
  }

  async remove(id: string, hrUserId: string): Promise<void> {
    const interview = await this.findOne(id, hrUserId);
    await this.interviewRepository.remove(interview);
  }

  async getUpcomingInterviews(hrUserId: string): Promise<Interview[]> {
    return this.interviewRepository.find({
      where: { approverId: hrUserId },
      relations: ['application', 'application.jobPosting'],
      order: { scheduledDateTime: 'ASC' },
    });
  }

  private getProjectRoot(): string {
    return path.resolve(__dirname, '../../../../../..');
  }

  private resolvePythonExecutable(venvDir: string): string {
    const pythonPath = path.join(venvDir, 'Scripts', 'python.exe');
    return fs.existsSync(pythonPath) ? pythonPath : 'python';
  }

  private async execPythonSafe(
    python: string,
    args: string[],
    outputPath: string,
    fallback: Record<string, unknown>,
  ): Promise<void> {
    try {
      this.logger.log(`[EXEC] Running: ${python} ${args.join(' ')}`);
      await execFileAsync(python, args, { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
      if (!fs.existsSync(outputPath)) {
        this.logger.error(`[EXEC] Output file not created: ${outputPath}`);
        throw new Error('Python script did not create output file');
      }
      this.logger.log(`[EXEC] Success: ${outputPath}`);
    } catch (err) {
      this.logger.error(`[EXEC] Error: ${err instanceof Error ? err.message : String(err)}`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          {
            ...fallback,
            warning: err instanceof Error ? err.message : String(err),
          },
          null,
          2,
        ),
        'utf8',
      );
    }
  }

  buildInterviewQuestions(jobRole: string): string[] {
    return [
      `Please introduce yourself for the ${jobRole} role.`,
      'Tell us about a project you are proud of.',
      'How do you handle deadlines and pressure?',
      'Describe a challenge you solved with your team.',
      'Why do you want to join this company?',
    ];
  }

  private scoreWrittenAnswers(
    questionsAnswers: Array<{ question: string; answer: string }>,
  ): number {
    const answers = questionsAnswers.map((q) => (q.answer || '').trim());
    if (!answers.length) return 3;

    let sum = 0;
    for (const a of answers) {
      const words = a.split(/\s+/).filter(Boolean).length;
      if (!a || /^no answer provided/i.test(a)) sum += 1;
      else if (words >= 20 || a.length >= 120) sum += 9;
      else if (words >= 10 || a.length >= 60) sum += 7;
      else if (words >= 5 || a.length >= 25) sum += 5;
      else if (words >= 2 || a.length >= 8) sum += 4;
      else sum += 2;
    }
    return sum / answers.length;
  }

  private scoreEmotion(emotionSummary: Record<string, unknown>): number {
    if (emotionSummary.error && !emotionSummary.framesAnalyzed) return 5;
    let score = 6;
    const risk = emotionSummary.riskLevel as string | undefined;
    if (risk === 'low') score += 2;
    else if (risk === 'medium') score -= 1;
    else if (risk === 'high') score -= 2;

    const frames = Number(emotionSummary.framesAnalyzed) || 0;
    const phones = Number(emotionSummary.phoneDetections) || 0;
    const papers = Number(emotionSummary.paperDetections) || 0;
    if (frames >= 15) score += 1;
    if (frames < 5) score -= 1;
    if (phones > 0) score -= Math.min(2, phones);
    if (papers > 0) score -= Math.min(2, Math.floor(papers / 5));  // Penalize if >5 paper detections

    return Math.max(1, Math.min(10, score));
  }

  private computeOverallScore(
    questionsAnswers: Array<{ question: string; answer: string }>,
    emotionSummary: Record<string, unknown>,
  ): number {
    const written = this.scoreWrittenAnswers(questionsAnswers);
    const emotion = this.scoreEmotion(emotionSummary);
    const combined = written * 0.65 + emotion * 0.35;
    return Math.max(1, Math.min(10, Math.round(combined)));
  }

  private getEmotionSessionDir(interviewId: string): string {
    return path.join(
      this.getProjectRoot(),
      '.runtime',
      'emotion-sessions',
      interviewId,
    );
  }

  private getEmotionPythonPaths(): {
    python: string;
    modelsDir: string;
    workerScript: string;
  } {
    const projectRoot = this.getProjectRoot();
    const emotionDir = path.join(projectRoot, 'emotiondetection');
    const modelsDir = path.join(emotionDir, 'models');
    return {
      python: this.resolvePythonExecutable(path.join(emotionDir, '.venv')),
      modelsDir,
      workerScript: path.join(modelsDir, 'emotion_worker.py'),
    };
  }

  private async startEmotionWorker(interviewId: string): Promise<void> {
    if (this.emotionWorkers.has(interviewId)) {
      return;
    }

    const { python, modelsDir, workerScript } = this.getEmotionPythonPaths();
    const sessionDir = this.getEmotionSessionDir(interviewId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const proc = spawn(python, [workerScript], {
      cwd: modelsDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    const handle: EmotionWorkerHandle = {
      proc,
      waiters: [],
      rejecters: [],
    };

    const rl = readline.createInterface({ input: proc.stdout! });
    rl.on('line', (line) => {
      try {
        const payload = JSON.parse(line) as Record<string, unknown>;
        const resolve = handle.waiters.shift();
        const reject = handle.rejecters.shift();
        if (payload.ok === false && reject) {
          reject(new Error(String(payload.error ?? 'Worker error')));
        } else if (resolve) {
          resolve(payload);
        }
      } catch (err) {
        const reject = handle.rejecters.shift();
        handle.waiters.shift();
        if (reject) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes('ready') || text.includes('Loading')) {
        this.logger.log(`[emotion ${interviewId}] ${text.trim()}`);
      }
    });

    proc.on('exit', () => {
      this.emotionWorkers.delete(interviewId);
    });

    this.emotionWorkers.set(interviewId, handle);
    await this.sendWorkerCommand(interviewId, { op: 'reset' }, 240_000);
  }

  private sendWorkerCommand(
    interviewId: string,
    command: Record<string, unknown>,
    timeoutMs = 90_000,
  ): Promise<Record<string, unknown>> {
    const handle = this.emotionWorkers.get(interviewId);
    if (!handle?.proc.stdin) {
      throw new Error('Emotion worker not running');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Emotion worker timeout'));
      }, timeoutMs);

      handle.waiters.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
      handle.rejecters.push((err) => {
        clearTimeout(timer);
        reject(err);
      });

      handle.proc.stdin!.write(`${JSON.stringify(command)}\n`);
    });
  }

  private stopEmotionWorker(interviewId: string): void {
    const handle = this.emotionWorkers.get(interviewId);
    if (handle?.proc && !handle.proc.killed) {
      handle.proc.kill();
    }
    this.emotionWorkers.delete(interviewId);
  }

  async initEmotionSession(interviewId: string): Promise<void> {
    try {
      await this.startEmotionWorker(interviewId);
    } catch (err) {
      this.logger.error(
        `Emotion worker failed to start for ${interviewId}: ${err}`,
      );
      const sessionDir = this.getEmotionSessionDir(interviewId);
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir, 'stats.json'),
        JSON.stringify({
          source: 'python_interview_monitor',
          framesAnalyzed: 0,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  async getEmotionSessionStatus(
    interviewId: string,
  ): Promise<Record<string, unknown>> {
    return (
      this.emotionLiveState.get(interviewId) ?? {
        framesAnalyzed: 0,
        phoneDetections: 0,
        gazeAlerts: 0,
        calibrated: false,
      }
    );
  }

  private async finalizeEmotionSession(
    interviewId: string,
  ): Promise<Record<string, unknown>> {
    const artifactsDir = path.join(
      this.getProjectRoot(),
      '.runtime',
      'interviews',
    );
    fs.mkdirSync(artifactsDir, { recursive: true });
    const outputPath = path.join(artifactsDir, `emotion_${interviewId}.json`);

    try {
      if (!this.emotionWorkers.has(interviewId)) {
        await this.startEmotionWorker(interviewId);
      }
      const result = await this.sendWorkerCommand(
        interviewId,
        { op: 'finalize' },
        60_000,
      );
      const summary = (result.summary ?? {}) as Record<string, unknown>;
      fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
      this.stopEmotionWorker(interviewId);
      return summary;
    } catch (err) {
      this.stopEmotionWorker(interviewId);
      return {
        source: 'python_interview_monitor',
        error: err instanceof Error ? err.message : String(err),
        riskLevel: 'unknown',
        framesAnalyzed: 0,
        phoneDetections: 0,
        gazeAlerts: 0,
      };
    }
  }

  async ingestEmotionFrame(
    interviewId: string,
    applicantEmail: string,
    imageBase64: string,
  ): Promise<Record<string, unknown>> {
    await this.assertCandidateInterview(interviewId, applicantEmail);

    if (!this.emotionWorkers.has(interviewId)) {
      await this.startEmotionWorker(interviewId);
    }

    const sessionDir = this.getEmotionSessionDir(interviewId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const buffer = Buffer.from(imageBase64, 'base64');
    const framePath = path.join(sessionDir, 'last_frame.jpg');
    const previewPath = path.join(sessionDir, 'preview.jpg');
    fs.writeFileSync(framePath, buffer);

    try {
      const result = await this.sendWorkerCommand(
        interviewId,
        {
          op: 'frame',
          path: framePath,
          preview: previewPath,
        },
        120_000,
      );

      const stats = (result.stats ?? {}) as Record<string, unknown>;
      const detection = result.detection as Record<string, unknown> | undefined;
      let previewBase64: string | undefined;
      if (fs.existsSync(previewPath)) {
        previewBase64 = fs.readFileSync(previewPath).toString('base64');
      }

      const live = {
        ...stats,
        detection,
        previewBase64,
      };
      this.emotionLiveState.set(interviewId, live);
      fs.writeFileSync(
        path.join(sessionDir, 'stats.json'),
        JSON.stringify(stats, null, 2),
      );
      return live;
    } catch (err) {
      this.logger.warn(`Frame analysis failed: ${err}`);
      return {
        ...(this.emotionLiveState.get(interviewId) ?? {}),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async assertCandidateInterview(
    interviewId: string,
    applicantEmail: string,
  ): Promise<Interview> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
      relations: ['application'],
    });
    if (!interview) {
      throw new NotFoundException('Interview not found');
    }
    if (interview.application.applicantEmail !== applicantEmail) {
      throw new BadRequestException('Unauthorized candidate');
    }
    return interview;
  }

  private async resolveEmotionSummary(
    interview: Interview,
    _clientSummary?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const sessionDir = this.getEmotionSessionDir(interview.id);
    if (
      this.emotionWorkers.has(interview.id) ||
      fs.existsSync(path.join(sessionDir, 'stats.json')) ||
      fs.existsSync(path.join(sessionDir, 'last_frame.jpg'))
    ) {
      return this.finalizeEmotionSession(interview.id);
    }

    const projectRoot = this.getProjectRoot();
    const emotionDir = path.join(projectRoot, 'emotiondetection');
    const emotionPython = this.resolvePythonExecutable(
      path.join(emotionDir, '.venv'),
    );
    const emotionScript = path.join(emotionDir, 'models', 'api_runner.py');
    const artifactsDir = path.join(projectRoot, '.runtime', 'interviews');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const emotionPath = path.join(artifactsDir, `emotion_${interview.id}.json`);

    await this.execPythonSafe(
      emotionPython,
      [
        emotionScript,
        '--duration-seconds',
        String(Math.max(15, Math.min(30, (interview.duration ?? 30)))),
        '--output',
        emotionPath,
      ],
      emotionPath,
      {
        error: 'Emotion analysis unavailable (server webcam).',
        riskLevel: 'unknown',
        source: 'server_fallback',
      },
    );

    return JSON.parse(fs.readFileSync(emotionPath, 'utf8')) as Record<
      string,
      unknown
    >;
  }

  async beginCandidateSession(applicantEmail: string, jobPostingId: string) {
    const application = await this.applicationRepository.findOne({
      where: { applicantEmail, jobPostingId },
      relations: ['jobPosting'],
    });
    if (!application) {
      throw new NotFoundException(
        'No application found. Ask HR to approve your candidacy first.',
      );
    }
    if (
      application.status !== 'interview_scheduled' &&
      application.status !== 'interview_in_progress'
    ) {
      throw new BadRequestException(
        `Interview not available (status: ${application.status}). Wait for HR approval.`,
      );
    }

    const interview = await this.interviewRepository.findOne({
      where: { applicationId: application.id },
      order: { scheduledDateTime: 'DESC' },
    });
    if (!interview) {
      throw new NotFoundException('No interview scheduled for this application');
    }

    application.status = 'interview_in_progress';
    interview.status = 'scheduled';
    await Promise.all([
      this.applicationRepository.save(application),
      this.interviewRepository.save(interview),
    ]);

    const seeker = await this.jobSeekerRepository.findOne({
      where: { email: applicantEmail },
    });
    if (seeker) {
      const jobSeekerApp = await this.jobApplicationRepository.findOne({
        where: {
          jobSeekerId: seeker.id,
          jobPostingId: application.jobPostingId,
        },
      });
      if (jobSeekerApp) {
        jobSeekerApp.status = 'interview_in_progress';
        await this.jobApplicationRepository.save(jobSeekerApp);
      }
    }

    await this.initEmotionSession(interview.id);

    const jobTitle = application.jobPosting?.title ?? 'this position';
    return {
      interviewId: interview.id,
      candidateName: application.applicantName,
      jobTitle,
      questions: this.buildInterviewQuestions(jobTitle),
    };
  }

  async finishCandidateSession(
    interviewId: string,
    applicantEmail: string,
    questionsAnswers: Array<{ question: string; answer: string }>,
  ) {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
      relations: ['application', 'application.jobPosting'],
    });
    if (!interview) {
      throw new NotFoundException('Interview not found');
    }
    if (interview.application.applicantEmail !== applicantEmail) {
      throw new BadRequestException('Unauthorized candidate');
    }

    const application = interview.application;
    const emotionJson = await this.resolveEmotionSummary(interview);
    const score = this.computeOverallScore(questionsAnswers, emotionJson);

    const answerPreview = questionsAnswers
      .map((qa, i) => `Q${i + 1}: ${(qa.answer || '').slice(0, 80)}`)
      .join(' | ');

    // Build recommendation with fraud alerts
    let fraudWarning = '';
    const phones = Number(emotionJson.phoneDetections) || 0;
    const papers = Number(emotionJson.paperDetections) || 0;
    const gazeAlerts = Number(emotionJson.gazeAlerts) || 0;
    if (phones > 0) {
      fraudWarning = ` [ALERT] Phone detected ${phones} times during interview.`;
    }
    if (papers > 0) {
      fraudWarning += ` [ALERT] Paper/documents detected ${papers} times during interview.`;
    }
    if (gazeAlerts > 3) {
      fraudWarning += ` [ALERT] Excessive gaze deviation (${gazeAlerts} alerts).`;
    }

    const recommendation = `Overall score: ${score}/10 (65% written answers, 35% presence). ${answerPreview}. ${
      score >= 7
        ? 'Strong candidate — recommend moving forward.'
        : score >= 5
          ? 'Moderate performance — HR review recommended.'
          : 'Below expectations — consider follow-up or rejection.'
    }${fraudWarning}`;

    let report = await this.reportRepository.findOne({
      where: { interviewId: interview.id },
    });
    if (!report) {
      report = this.reportRepository.create({
        interviewId: interview.id,
        applicationId: application.id,
        candidateName: application.applicantName,
        questionsAnswers,
        emotionSummary: { ...emotionJson, overallScore: score },
        finalDecisionHints: recommendation,
        rawArtifacts: { emotionSource: emotionJson.source ?? 'unknown' },
      });
    } else {
      report.questionsAnswers = questionsAnswers;
      report.emotionSummary = { ...emotionJson, overallScore: score };
      report.finalDecisionHints = recommendation;
      report.rawArtifacts = { emotionSource: emotionJson.source ?? 'unknown' };
    }

    interview.status = 'completed';
    interview.score = score;
    interview.feedback = recommendation;
    application.status = 'interview_completed';
    application.rating = score;

    const savedReport = await this.reportRepository.save(report);
    await Promise.all([
      this.interviewRepository.save(interview),
      this.applicationRepository.save(application),
    ]);

    const seeker = await this.jobSeekerRepository.findOne({
      where: { email: applicantEmail },
    });
    if (seeker) {
      const jobSeekerApp = await this.jobApplicationRepository.findOne({
        where: {
          jobSeekerId: seeker.id,
          jobPostingId: application.jobPostingId,
        },
      });
      if (jobSeekerApp) {
        jobSeekerApp.status = 'interview_completed';
        await this.jobApplicationRepository.save(jobSeekerApp);
      }
    }

    return {
      success: true,
      interviewId: interview.id,
      score,
      reportId: savedReport.id,
      message: 'Interview completed. HR can view your report.',
    };
  }

  private buildFallbackTranscript(
    application: Application,
  ): Record<string, unknown> {
    const role = application.jobPosting?.title ?? 'Interview Candidate';
    const questions = [
      `Please introduce yourself for the ${role} role.`,
      'Tell us about a project you are proud of.',
      'How do you handle deadlines and pressure?',
    ];
    return {
      candidateName: application.applicantName,
      jobRole: role,
      questionsAnswers: questions.map((q) => ({
        question: q,
        answer:
          'Interview could not capture audio. Allow microphone access and retry, or run from HR Scheduled Meetings.',
      })),
      finalDecisionHints:
        'Interview completed in fallback mode. Audio capture failed — review manually or retry with microphone enabled.',
    };
  }

  async startInterview(id: string, hrUserId: string): Promise<Interview> {
    const interview = await this.findOne(id, hrUserId);
    interview.status = 'scheduled';
    const application = await this.applicationRepository.findOne({
      where: { id: interview.applicationId },
      relations: ['jobPosting'],
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    application.status = 'interview_in_progress';
    await Promise.all([
      this.applicationRepository.save(application),
      this.interviewRepository.save(interview),
    ]);

    const seeker = await this.jobSeekerRepository.findOne({
      where: { email: application.applicantEmail },
    });
    if (seeker) {
      const jobSeekerApp = await this.jobApplicationRepository.findOne({
        where: {
          jobSeekerId: seeker.id,
          jobPostingId: application.jobPostingId,
        },
      });
      if (jobSeekerApp) {
        jobSeekerApp.status = 'interview_in_progress';
        await this.jobApplicationRepository.save(jobSeekerApp);
      }
    }

    return interview;
  }

  async startInterviewByCandidate(
    id: string,
    applicantEmail: string,
  ): Promise<Interview> {
    const interview = await this.interviewRepository.findOne({
      where: { id },
      relations: ['application'],
    });
    if (!interview) {
      throw new NotFoundException('Interview not found');
    }
    if (interview.application.applicantEmail !== applicantEmail) {
      throw new BadRequestException('Unauthorized candidate');
    }

    interview.status = 'scheduled';
    interview.application.status = 'interview_in_progress';
    await Promise.all([
      this.applicationRepository.save(interview.application),
      this.interviewRepository.save(interview),
    ]);
    return interview;
  }

  async completeAndGenerateReport(
    id: string,
    hrUserId: string,
  ): Promise<InterviewReport> {
    const interview = await this.findOne(id, hrUserId);
    return this.runInterviewAutomation(interview);
  }

  private async runInterviewAutomation(
    interview: Interview,
  ): Promise<InterviewReport> {
    const application = await this.applicationRepository.findOne({
      where: { id: interview.applicationId },
      relations: ['jobPosting'],
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const existingReport = await this.reportRepository.findOne({
      where: { interviewId: interview.id },
    });
    if (
      existingReport?.questionsAnswers?.length &&
      existingReport.questionsAnswers.some(
        (qa) => qa.answer && !/Interview could not capture audio/i.test(qa.answer),
      )
    ) {
      return existingReport;
    }

    const projectRoot = this.getProjectRoot();
    const chatbotDir = path.join(projectRoot, 'chatbot');
    const emotionDir = path.join(projectRoot, 'emotiondetection');
    const chatbotPython = this.resolvePythonExecutable(path.join(chatbotDir, '.venv'));
    const emotionPython = this.resolvePythonExecutable(path.join(emotionDir, '.venv'));
    const chatbotScript = path.join(chatbotDir, 'hr_interview.py');
    const emotionScript = path.join(emotionDir, 'models', 'api_runner.py');

    const artifactsDir = path.join(projectRoot, '.runtime', 'interviews');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const transcriptPath = path.join(
      artifactsDir,
      `transcript_${interview.id}.json`,
    );
    const emotionPath = path.join(artifactsDir, `emotion_${interview.id}.json`);

    const jobRole = application.jobPosting?.title ?? 'Interview Candidate';
    const answerSeconds = String(
      Math.max(6, Math.min(15, Math.floor((interview.duration ?? 30) / 3))),
    );
    const emotionSeconds = String(
      Math.max(10, Math.min(90, (interview.duration ?? 30) * 2)),
    );

    // Create a temporary resume file if provided
    let resumePath = '';
    if (application.applicantResume) {
      resumePath = path.join(
        artifactsDir,
        `resume_${interview.id}.txt`,
      );
      try {
        fs.writeFileSync(resumePath, application.applicantResume, 'utf8');
      } catch (e) {
        this.logger.warn(`Failed to write resume file: ${e}`);
        resumePath = '';
      }
    }

    await this.execPythonSafe(
      chatbotPython,
      [
        chatbotScript,
        '--job-role',
        jobRole,
        '--output',
        transcriptPath,
        ...(!resumePath ? [] : ['--resume', resumePath]),
      ],
      transcriptPath,
      this.buildFallbackTranscript(application),
    );

    await this.execPythonSafe(
      emotionPython,
      [
        emotionScript,
        '--duration-seconds',
        emotionSeconds,
        '--output',
        emotionPath,
      ],
      emotionPath,
      {
        error: 'Emotion analysis unavailable (webcam or model error).',
        riskLevel: 'unknown',
      },
    );

    const transcriptRaw = fs.readFileSync(transcriptPath, 'utf8');
    const emotionRaw = fs.readFileSync(emotionPath, 'utf8');
    const transcriptJson = JSON.parse(transcriptRaw);
    const emotionJson = JSON.parse(emotionRaw) as Record<string, unknown>;
    const questionsAnswers = Array.isArray(transcriptJson.questionsAnswers)
      ? transcriptJson.questionsAnswers
      : [];
    const score = this.computeOverallScore(questionsAnswers, emotionJson);
    const feedback = `Overall score: ${score}/10 (HR server-side run).`;

    let report = await this.reportRepository.findOne({
      where: { interviewId: interview.id },
    });

    if (!report) {
      report = this.reportRepository.create({
        interviewId: interview.id,
        applicationId: application.id,
        candidateName: application.applicantName,
        questionsAnswers,
        emotionSummary: { ...emotionJson, overallScore: score },
        finalDecisionHints:
          transcriptJson.finalDecisionHints ?? feedback,
        rawArtifacts: {
          transcriptPath,
          emotionPath,
        },
      });
    } else {
      report.questionsAnswers = questionsAnswers;
      report.emotionSummary = { ...emotionJson, overallScore: score };
      report.finalDecisionHints =
        transcriptJson.finalDecisionHints ?? feedback;
      report.rawArtifacts = { transcriptPath, emotionPath };
    }

    interview.status = 'completed';
    interview.score = score;
    interview.feedback = feedback;
    application.status = 'interview_completed';
    application.rating = score;

    const savedReport = await this.reportRepository.save(report);
    await Promise.all([
      this.interviewRepository.save(interview),
      this.applicationRepository.save(application),
    ]);

    const seeker = await this.jobSeekerRepository.findOne({
      where: { email: application.applicantEmail },
    });
    if (seeker) {
      const jobSeekerApp = await this.jobApplicationRepository.findOne({
        where: {
          jobSeekerId: seeker.id,
          jobPostingId: application.jobPostingId,
        },
      });
      if (jobSeekerApp) {
        jobSeekerApp.status = 'interview_completed';
        await this.jobApplicationRepository.save(jobSeekerApp);
      }
    }

    return savedReport;
  }

  async completeAndGenerateReportByCandidate(
    applicantEmail: string,
    jobPostingId: string,
  ): Promise<InterviewReport> {
    const application = await this.applicationRepository.findOne({
      where: { applicantEmail, jobPostingId },
    });
    if (!application) {
      throw new NotFoundException('No approved application found for candidate');
    }
    if (
      application.status !== 'interview_scheduled' &&
      application.status !== 'interview_in_progress'
    ) {
      throw new BadRequestException('Application is not ready for interview');
    }

    const interview = await this.interviewRepository.findOne({
      where: { applicationId: application.id },
      order: { scheduledDateTime: 'DESC' },
    });
    if (!interview) {
      throw new NotFoundException('No interview scheduled for this application');
    }

    interview.status = 'scheduled';
    application.status = 'interview_in_progress';
    await Promise.all([
      this.applicationRepository.save(application),
      this.interviewRepository.save(interview),
    ]);

    return this.runInterviewAutomation(interview);
  }

  async getReport(id: string, hrUserId: string): Promise<InterviewReport> {
    await this.findOne(id, hrUserId);
    const report = await this.reportRepository.findOne({
      where: { interviewId: id },
    });
    if (!report) {
      throw new NotFoundException('Interview report not found');
    }
    return report;
  }
}
