import type { RegisterDef } from "../config/registerTypes";
import { env } from "../config/env";

export interface ExtractionFileInput {
  id: string;
  path: string;
  mimeType: string;
  originalName?: string;
}
export interface ExtractionInput {
  register: RegisterDef;
  files: ExtractionFileInput[];
}

export interface ExtractedRecord {
  /** Values keyed by the register's dotted field paths. */
  fields: Record<string, unknown>;
  /** Field paths the provider is unsure about. */
  uncertainFields: string[];
  confidence?: number;
  sourceFileId?: string;
  page?: number;
}

export interface ExtractionResult {
  providerName: string;
  /** True only for development mocks. Mock output is NOT real OCR/AI extraction. */
  isMock: boolean;
  records: ExtractedRecord[];
  warnings: string[];
}

/** Implement this to plug in a real OCR/AI service (Google Vision, AWS Textract, Azure Document Intelligence, an LLM vision model...). */
export interface ExtractionProvider {
  readonly name: string;
  readonly isMock: boolean;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

// ───────────── mock provider (development only) ─────────────
export const MOCK_WARNING =
  "MOCK PROVIDER: no OCR or AI extraction was performed. These are empty placeholder drafts for manual entry; every field is flagged for human review.";

export class MockExtractionProvider implements ExtractionProvider {
  readonly name = "mock";
  readonly isMock = true;

  async extract({
    register,
    files,
  }: ExtractionInput): Promise<ExtractionResult> {
    return {
      providerName: this.name,
      isMock: true,
      warnings: [MOCK_WARNING],
      // Deliberately empty: the mock never fabricates parish data.
      records: files.map((f) => ({
        fields: {},
        uncertainFields: register.fields.map((x) => x.path),
        confidence: 0,
        sourceFileId: f.id,
      })),
    };
  }
}

export function getExtractionProvider(): ExtractionProvider {
  switch (env.EXTRACTION_PROVIDER) {
    case "mock":
    default:
      return new MockExtractionProvider();
  }
}
