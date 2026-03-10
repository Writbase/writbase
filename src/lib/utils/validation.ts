import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export const projectUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  isArchived: z.boolean().optional(),
});

export const departmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

export const departmentUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  isArchived: z.boolean().optional(),
});

export const taskCreateSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  departmentId: z.string().uuid('Invalid department ID').optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  description: z.string().min(3, 'Description must be at least 3 characters').max(5000),
  notes: z.string().max(10000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional().default('todo'),
});

export const taskUpdateSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(1),
    projectId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional().nullable(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    description: z.string().min(3).max(5000).optional(),
    notes: z.string().max(10000).optional().nullable(),
    dueDate: z.string().datetime().optional().nullable(),
    status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']).optional(),
  })
  .refine(
    (data) => {
      const { id, version, ...fields } = data;
      return Object.keys(fields).length > 0;
    },
    { message: 'At least one field to update is required' },
  );

export const agentKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['worker', 'manager']).optional().default('worker'),
  specialPrompt: z.string().max(5000).optional().nullable(),
});

export const agentKeyUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  specialPrompt: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const permissionSchema = z.object({
  agentKeyId: z.string().uuid(),
  projectId: z.string().uuid(),
  departmentId: z.string().uuid().optional().nullable(),
  canRead: z.boolean().default(true),
  canCreate: z.boolean().default(false),
  canUpdate: z.boolean().default(false),
});

export const permissionsUpdateSchema = z.object({
  keyId: z.string().uuid(),
  permissions: z.array(
    z.object({
      projectId: z.string().uuid(),
      departmentId: z.string().uuid().optional().nullable(),
      canRead: z.boolean().default(true),
      canCreate: z.boolean().default(false),
      canUpdate: z.boolean().default(false),
    }),
  ),
});
