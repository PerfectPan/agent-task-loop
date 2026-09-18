import { z } from 'zod';
import { TASK_STATUSES, TARGET_AGENTS } from '../types/task';

const requiredText = (maxLength: number) =>
  z.string().min(1).max(maxLength).regex(/\S/).transform(value => value.trim());
const optionalText = (maxLength: number) =>
  z.string().max(maxLength).transform(value => value.trim());

export const listTasksInputSchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  targetAgent: z.enum(TARGET_AGENTS).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();

export const listTasksInputJsonSchema = {
  additionalProperties: false,
  properties: {
    status: { enum: TASK_STATUSES, type: 'string' },
    targetAgent: { enum: TARGET_AGENTS, type: 'string' },
    limit: { default: 50, maximum: 100, minimum: 1, type: 'integer' },
  },
  type: 'object',
} as const;

export const getTaskInputSchema = z.object({
  taskId: requiredText(128),
}).strict();

export const getTaskInputJsonSchema = {
  additionalProperties: false,
  properties: {
    taskId: { maxLength: 128, minLength: 1, pattern: '\\S', type: 'string' },
  },
  required: ['taskId'],
  type: 'object',
} as const;

export const createTaskInputSchema = z.object({
  taskId: requiredText(128),
  title: requiredText(200),
  project: requiredText(120),
  targetAgent: z.enum(TARGET_AGENTS),
  priority: z.number().int().min(0).max(9),
  description: optionalText(8_000).optional(),
  source: requiredText(240).optional(),
}).strict();

export const createTaskInputJsonSchema = {
  additionalProperties: false,
  properties: {
    taskId: { maxLength: 128, minLength: 1, pattern: '\\S', type: 'string' },
    title: { maxLength: 200, minLength: 1, pattern: '\\S', type: 'string' },
    project: { maxLength: 120, minLength: 1, pattern: '\\S', type: 'string' },
    targetAgent: { enum: TARGET_AGENTS, type: 'string' },
    priority: { maximum: 9, minimum: 0, type: 'integer' },
    description: { maxLength: 8_000, type: 'string' },
    source: { maxLength: 240, minLength: 1, pattern: '\\S', type: 'string' },
  },
  required: ['taskId', 'title', 'project', 'targetAgent', 'priority'],
  type: 'object',
} as const;

export const startTaskInputSchema = z.object({
  taskId: requiredText(128),
  targetAgent: z.enum(TARGET_AGENTS).optional(),
  maxRounds: z.number().int().min(1).max(20).default(5),
}).strict();

export const startTaskInputJsonSchema = {
  additionalProperties: false,
  properties: {
    taskId: { maxLength: 128, minLength: 1, pattern: '\\S', type: 'string' },
    targetAgent: { enum: TARGET_AGENTS, type: 'string' },
    maxRounds: { default: 5, maximum: 20, minimum: 1, type: 'integer' },
  },
  required: ['taskId'],
  type: 'object',
} as const;
