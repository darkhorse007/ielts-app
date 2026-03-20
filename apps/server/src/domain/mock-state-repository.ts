import { Pool } from "pg";
import type { MockExam, MockExamReport } from "./types.js";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const stringifyJson = (value: unknown): string => JSON.stringify(value);

const upsertPgSql = (table: string, keyColumn: string, updateColumns: string[]): string => {
  const columns = [keyColumn, ...updateColumns];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updates = updateColumns.map((column) => `${column}=EXCLUDED.${column}`).join(", ");
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${keyColumn}) DO UPDATE SET ${updates}`;
};

class PersistedMap<K, V> extends Map<K, V> {
  constructor(
    private readonly onSet: (key: K, value: V) => void,
    private readonly onDelete?: (key: K) => void
  ) {
    super();
  }

  setSilently(key: K, value: V): this {
    super.set(key, value);
    return this;
  }

  override set(key: K, value: V): this {
    super.set(key, value);
    this.onSet(key, value);
    return this;
  }

  override delete(key: K): boolean {
    const existed = super.delete(key);
    if (existed) {
      this.onDelete?.(key);
    }
    return existed;
  }
}

const MOCK_STATE_SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validateSchemaName = (schema: string): void => {
  if (!MOCK_STATE_SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error("MOCK_STATE_POSTGRES_SCHEMA_INVALID");
  }
};

export const MOCK_STATE_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS mock_exams (
  exam_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mock_exam_reports (
  report_id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export interface MockStateRepository {
  readonly mockExamsById: Map<string, MockExam>;
  readonly mockExamReportsById: Map<string, MockExamReport>;
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryMockStateRepository implements MockStateRepository {
  readonly mockExamsById = new Map<string, MockExam>();
  readonly mockExamReportsById = new Map<string, MockExamReport>();

  ready(): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export class PostgresMockStateRepository implements MockStateRepository {
  readonly mockExamsById: PersistedMap<string, MockExam>;
  readonly mockExamReportsById: PersistedMap<string, MockExamReport>;

  private readonly pool: Pool;
  private readonly schema: string;
  private readyPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private closed = false;

  constructor(options: { connectionString?: string; schema?: string }) {
    if (!options.connectionString) {
      throw new Error("MOCK_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    this.schema = options.schema ?? "public";
    validateSchemaName(this.schema);
    this.pool = new Pool({
      connectionString: options.connectionString
    });

    const examUpsert = upsertPgSql(this.table("mock_exams"), "exam_id", ["user_id", "status", "payload_json", "updated_at"]);
    const reportUpsert = upsertPgSql(this.table("mock_exam_reports"), "report_id", [
      "exam_id",
      "user_id",
      "payload_json",
      "updated_at"
    ]);

    this.mockExamsById = new PersistedMap<string, MockExam>(
      (examId, exam) => {
        this.queueQuery(examUpsert, [examId, exam.userId, exam.status, stringifyJson(exam), exam.updatedAt]);
      },
      (examId) => {
        this.queueQuery(`DELETE FROM ${this.table("mock_exams")} WHERE exam_id = $1`, [examId]);
      }
    );

    this.mockExamReportsById = new PersistedMap<string, MockExamReport>(
      (reportId, report) => {
        this.queueQuery(reportUpsert, [reportId, report.examId, report.userId, stringifyJson(report), report.updatedAt]);
      },
      (reportId) => {
        this.queueQuery(`DELETE FROM ${this.table("mock_exam_reports")} WHERE report_id = $1`, [reportId]);
      }
    );
  }

  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize();
    }
    return this.readyPromise;
  }

  async flush(): Promise<void> {
    try {
      await this.writeChain;
    } catch {
      if (this.writeError) {
        const error = this.writeError;
        this.writeError = null;
        throw error;
      }
      throw new Error("MOCK_STATE_POSTGRES_FLUSH_FAILED");
    }
    if (this.writeError) {
      const error = this.writeError;
      this.writeError = null;
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.flush();
    await this.pool.end();
  }

  private async initialize(): Promise<void> {
    if (this.schema !== "public") {
      await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    }
    await this.pool.query(this.qualifySchemaSql(MOCK_STATE_POSTGRES_SCHEMA));

    this.mockExamsById.clear();
    this.mockExamReportsById.clear();

    const [exams, reports] = await Promise.all([
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("mock_exams")}`),
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("mock_exam_reports")}`)
    ]);

    for (const row of exams.rows) {
      const exam = parseJson<MockExam>(row.payload_json);
      this.mockExamsById.setSilently(exam.id, exam);
    }
    for (const row of reports.rows) {
      const report = parseJson<MockExamReport>(row.payload_json);
      this.mockExamReportsById.setSilently(report.id, report);
    }
  }

  private queueQuery(text: string, values: Array<string | number | boolean | null>): void {
    const task = async () => {
      await this.pool.query(text, values);
    };
    this.writeChain = this.writeChain.then(task, task).catch((error: unknown) => {
      if (!this.writeError) {
        this.writeError = error instanceof Error ? error : new Error(String(error));
      }
      throw error;
    });
  }

  private table(name: string): string {
    return `${this.schema}.${name}`;
  }

  private qualifySchemaSql(sql: string): string {
    return sql.replaceAll("mock_", `${this.schema}.mock_`);
  }
}
