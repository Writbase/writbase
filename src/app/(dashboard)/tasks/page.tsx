import { ErrorBoundary } from '@/components/error-boundary';
import { TaskTable } from '@/components/task-table';

interface TasksPageProps {
  searchParams: Promise<{
    project?: string;
    department?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const params = await searchParams;
  const projectId = params.project;
  const departmentId = params.department;

  if (!projectId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tasks</h1>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Select a project to view tasks
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <TaskTable projectId={projectId} departmentId={departmentId} />
    </ErrorBoundary>
  );
}
