export interface DocumentRecord {
  id: string;
  originalFilename: string;
  storedFilename: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  maxFileSizeBytes?: number;
}

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'core' | 'validation' | 'security' | 'resilience';
  passed: boolean;
  durationMs: number;
  expectedStatus: number;
  actualStatus: number;
  details: string;
}

export interface TestSuiteReport {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  executedAt: string;
  results: TestCaseResult[];
}

export interface DotnetFileEntry {
  path: string;
  name: string;
  language: string;
  content: string;
}

export type WorkspaceView = 'vault' | 'explorer' | 'tests' | 'dotnet';
