interface TasksPageProps {
  searchParams: Promise<{ project?: string; department?: string }>
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const params = await searchParams
  const projectId = params.project
  const departmentId = params.department

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Tasks
        {projectId && (
          <span className="ml-2 text-lg font-normal text-slate-500">
            (filtered by project)
          </span>
        )}
        {departmentId && (
          <span className="ml-2 text-lg font-normal text-slate-500">
            (filtered by department)
          </span>
        )}
      </h1>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Task table will go here
      </div>
    </div>
  )
}
