'use client';

interface SidebarDepartmentSelectorProps {
  activeDepartments: Array<{ id: string; name: string; is_archived: boolean }>;
  selectedDepartment: string;
  onSelectDepartment: (id: string) => void;
  onAddDepartment: () => void;
  onEditDepartment: (department: { id: string; name: string }) => void;
  onArchiveDepartment: (id: string) => void;
}

export function SidebarDepartmentSelector({
  activeDepartments,
  selectedDepartment,
  onSelectDepartment,
  onAddDepartment,
  onEditDepartment,
  onArchiveDepartment,
}: SidebarDepartmentSelectorProps) {
  return (
    <>
      {/* Department selector */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Department
          </label>
          <button onClick={onAddDepartment} className="text-xs text-blue-400 hover:text-blue-300">
            + Add
          </button>
        </div>
        <select
          value={selectedDepartment}
          onChange={(e) => {
            onSelectDepartment(e.target.value);
          }}
          className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All departments</option>
          {activeDepartments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Department management list */}
      {activeDepartments.length > 0 && (
        <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto">
          {activeDepartments.map((d) => (
            <div
              key={d.id}
              className="group flex items-center justify-between rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              <span className="truncate">{d.name}</span>
              <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => {
                    onEditDepartment({ id: d.id, name: d.name });
                  }}
                  className="text-slate-400 hover:text-blue-400"
                  aria-label={`Rename ${d.name}`}
                  title="Rename"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    onArchiveDepartment(d.id);
                  }}
                  className="text-slate-400 hover:text-red-400"
                  aria-label={`Archive ${d.name}`}
                  title="Archive"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
