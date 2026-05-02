import type { AppConfig } from '../config/schema';
import { runLarkCli } from './lark-cli';

export interface TaskFieldDefinition {
  name: string;
  json: Record<string, unknown>;
}

interface ExistingField {
  id?: string;
  name: string;
  type?: string;
  options?: string[];
}

const TASK_FIELD_DEFINITIONS: TaskFieldDefinition[] = [
  { name: 'TaskID', json: { type: 'text', name: 'TaskID' } },
  { name: 'Title', json: { type: 'text', name: 'Title' } },
  { name: 'Description', json: { type: 'text', name: 'Description' } },
  { name: 'Project', json: { type: 'text', name: 'Project' } },
  { name: 'Repository', json: { type: 'text', name: 'Repository' } },
  {
    name: 'TargetAgent',
    json: {
      type: 'select',
      name: 'TargetAgent',
      multiple: false,
      options: [
        { name: 'claude', hue: 'Blue', lightness: 'Lighter' },
        { name: 'codex', hue: 'Green', lightness: 'Lighter' },
        { name: 'coco', hue: 'Orange', lightness: 'Lighter' },
        { name: 'glm', hue: 'Purple', lightness: 'Lighter' },
      ],
    },
  },
  { name: 'Priority', json: { type: 'number', name: 'Priority', style: { type: 'plain', precision: 0 } } },
  {
    name: 'Status',
    json: {
      type: 'select',
      name: 'Status',
      multiple: false,
      options: [
        { name: '待处理', hue: 'Blue', lightness: 'Lighter' },
        { name: '进行中', hue: 'Orange', lightness: 'Light' },
        { name: '执行中', hue: 'Orange', lightness: 'Light' },
        { name: '待复核', hue: 'Purple', lightness: 'Lighter' },
        { name: '修复中', hue: 'Orange', lightness: 'Light' },
        { name: '待决策', hue: 'Yellow', lightness: 'Lighter' },
        { name: '待发布', hue: 'Cyan', lightness: 'Lighter' },
        { name: '待验收', hue: 'Purple', lightness: 'Lighter' },
        { name: '已完成', hue: 'Green', lightness: 'Light' },
        { name: '已失败', hue: 'Red', lightness: 'Light' },
      ],
    },
  },
  { name: 'WorkspacePath', json: { type: 'text', name: 'WorkspacePath', style: { type: 'plain' } } },
  { name: 'LogPath', json: { type: 'text', name: 'LogPath', style: { type: 'plain' } } },
  { name: 'ProgressSummary', json: { type: 'text', name: 'ProgressSummary' } },
  { name: 'SessionId', json: { type: 'text', name: 'SessionId', style: { type: 'plain' } } },
  { name: 'SessionName', json: { type: 'text', name: 'SessionName', style: { type: 'plain' } } },
  { name: 'ResultSummary', json: { type: 'text', name: 'ResultSummary' } },
  { name: 'PRLink', json: { type: 'text', name: 'PRLink', style: { type: 'url' } } },
  { name: 'LastError', json: { type: 'text', name: 'LastError' } },
  { name: 'ClaimedBy', json: { type: 'text', name: 'ClaimedBy' } },
  { name: 'ClaimedAt', json: { type: 'datetime', name: 'ClaimedAt', style: { format: 'yyyy-MM-dd HH:mm' } } },
  { name: 'CreatedAt', json: { type: 'datetime', name: 'CreatedAt', style: { format: 'yyyy-MM-dd HH:mm' } } },
  { name: 'RunId', json: { type: 'text', name: 'RunId' } },
  { name: 'UpdatedAt', json: { type: 'datetime', name: 'UpdatedAt', style: { format: 'yyyy-MM-dd HH:mm' } } },
  { name: 'CurrentOwner', json: { type: 'text', name: 'CurrentOwner' } },
  { name: 'ReviewRound', json: { type: 'number', name: 'ReviewRound', style: { type: 'plain', precision: 0 } } },
  {
    name: 'ReviewVerdict',
    json: {
      type: 'select',
      name: 'ReviewVerdict',
      multiple: false,
      options: [
        { name: '通过', hue: 'Green', lightness: 'Light' },
        { name: '驳回', hue: 'Red', lightness: 'Light' },
      ],
    },
  },
  { name: 'ReviewFindings', json: { type: 'text', name: 'ReviewFindings' } },
  { name: 'AcceptanceRound', json: { type: 'number', name: 'AcceptanceRound', style: { type: 'plain', precision: 0 } } },
  {
    name: 'AcceptanceVerdict',
    json: {
      type: 'select',
      name: 'AcceptanceVerdict',
      multiple: false,
      options: [
        { name: '通过', hue: 'Green', lightness: 'Light' },
        { name: '打回', hue: 'Red', lightness: 'Light' },
      ],
    },
  },
  { name: 'AcceptanceFeedback', json: { type: 'text', name: 'AcceptanceFeedback' } },
  { name: 'ExecutionSessionId', json: { type: 'text', name: 'ExecutionSessionId', style: { type: 'plain' } } },
  { name: 'ExecutionSessionName', json: { type: 'text', name: 'ExecutionSessionName', style: { type: 'plain' } } },
  { name: 'ReviewSessionId', json: { type: 'text', name: 'ReviewSessionId', style: { type: 'plain' } } },
  { name: 'ReviewSessionName', json: { type: 'text', name: 'ReviewSessionName', style: { type: 'plain' } } },
  { name: 'ReviewLogPath', json: { type: 'text', name: 'ReviewLogPath', style: { type: 'plain' } } },
  { name: 'SessionHistory', json: { type: 'text', name: 'SessionHistory' } },
  { name: 'RunnerPid', json: { type: 'number', name: 'RunnerPid', style: { type: 'plain', precision: 0 } } },
  { name: 'RunnerKind', json: { type: 'text', name: 'RunnerKind' } },
  { name: 'RunnerAgent', json: { type: 'text', name: 'RunnerAgent' } },
  { name: 'RunnerRound', json: { type: 'number', name: 'RunnerRound', style: { type: 'plain', precision: 0 } } },
  { name: 'LastHeartbeatAt', json: { type: 'datetime', name: 'LastHeartbeatAt', style: { format: 'yyyy-MM-dd HH:mm' } } },
  { name: 'PublishBranch', json: { type: 'text', name: 'PublishBranch', style: { type: 'plain' } } },
  { name: 'PublishCommit', json: { type: 'text', name: 'PublishCommit', style: { type: 'plain' } } },
  { name: 'PublishedAt', json: { type: 'datetime', name: 'PublishedAt', style: { format: 'yyyy-MM-dd HH:mm' } } },
];

interface FieldListResponse {
  items?: Array<Record<string, unknown>>;
  data?: {
    items?: Array<Record<string, unknown>>;
    fields?: Array<Record<string, unknown>>;
  };
}

function isNoOpFieldUpdateError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes('800070003') || error.message.includes('no operation produced');
}

function extractFieldName(item: Record<string, unknown>): string | null {
  const directName = item.name ?? item.field_name ?? item.fieldName;
  if (typeof directName === 'string' && directName.length > 0) {
    return directName;
  }

  const field = item.field;
  if (field && typeof field === 'object') {
    const nestedName = (field as Record<string, unknown>).name ?? (field as Record<string, unknown>).field_name;
    if (typeof nestedName === 'string' && nestedName.length > 0) {
      return nestedName;
    }
  }

  return null;
}

function normalizeExistingField(item: Record<string, unknown>): ExistingField | null {
  const name = extractFieldName(item);
  if (!name) {
    return null;
  }

  const options =
    Array.isArray(item.options) ?
      item.options
        .map(option => {
          if (option && typeof option === 'object' && typeof (option as Record<string, unknown>).name === 'string') {
            return (option as Record<string, unknown>).name as string;
          }
          return null;
        })
        .filter((option): option is string => Boolean(option))
    : undefined;

  return {
    id: typeof item.id === 'string' ? item.id : undefined,
    name,
    type: typeof item.type === 'string' ? item.type : undefined,
    options,
  };
}

export class TaskTableSchemaService {
  constructor(private readonly config: AppConfig) {}

  getRequiredFields(): TaskFieldDefinition[] {
    return TASK_FIELD_DEFINITIONS;
  }

  async listExistingFields(): Promise<ExistingField[]> {
    const stdout = await runLarkCli([
      'base',
      '+field-list',
      '--base-token',
      this.config.feishu.baseToken,
      '--table-id',
      this.config.feishu.tableId,
    ]);

    const data = JSON.parse(stdout) as FieldListResponse;
    const items = data.items ?? data.data?.items ?? data.data?.fields ?? [];

    return items
      .map(item => normalizeExistingField(item))
      .filter((field): field is ExistingField => Boolean(field));
  }

  async checkSchema(): Promise<{ existing: string[]; missing: string[] }> {
    const existingFields = await this.listExistingFields();
    const existing = existingFields.map(field => field.name);
    const existingSet = new Set(existing);
    const missing = TASK_FIELD_DEFINITIONS.map(field => field.name).filter(name => !existingSet.has(name));
    return { existing, missing };
  }

  async applyMissingFields(existing?: string[]): Promise<{ created: string[]; updated: string[] }> {
    const fieldDetails =
      existing ?
        existing.map(name => ({ name }))
      : await this.listExistingFields();
    const existingFields = new Set(fieldDetails.map(field => field.name));
    const existingByName = new Map(fieldDetails.map(field => [field.name, field]));
    const created: string[] = [];
    const updated: string[] = [];

    for (const field of TASK_FIELD_DEFINITIONS) {
      if (!existingFields.has(field.name)) {
        await runLarkCli([
          'base',
          '+field-create',
          '--base-token',
          this.config.feishu.baseToken,
          '--table-id',
          this.config.feishu.tableId,
          '--json',
          JSON.stringify(field.json),
        ]);

        created.push(field.name);
        continue;
      }

      const existingField = existingByName.get(field.name);
      const requiredOptions = Array.isArray(field.json.options) ?
        field.json.options
          .map(option => (option && typeof option === 'object' ? (option as Record<string, unknown>).name : undefined))
          .filter((option): option is string => typeof option === 'string')
      : [];
      const existingOptions = existingField?.options ?? [];
      const isSelectField = field.json.type === 'select';
      const missingOption = isSelectField && requiredOptions.some(option => !existingOptions.includes(option));

      if (missingOption) {
        try {
          await runLarkCli([
            'base',
            '+field-update',
            '--base-token',
            this.config.feishu.baseToken,
            '--table-id',
            this.config.feishu.tableId,
            '--field-id',
            existingField?.id ?? field.name,
            '--json',
            JSON.stringify(field.json),
          ]);
          updated.push(field.name);
        } catch (error) {
          if (!isNoOpFieldUpdateError(error)) {
            throw error;
          }
        }
      }
    }

    return { created, updated };
  }
}
