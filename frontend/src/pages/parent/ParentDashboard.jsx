import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { fetchParentDashboard } from "../../api/parent.js";
import ProfileLogoutMenu from "../../components/ProfileLogoutMenu.jsx";

const QUARTERS = [1, 2, 3, 4];

const paceRange = (row) => {
  if (row.pace_start == null) return "—";
  const end = row.pace_end ?? row.pace_start + (row.pace_count ?? 1) - 1;
  return end > row.pace_start ? `${row.pace_start}–${end}` : String(row.pace_start);
};

export default function ParentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchParentDashboard()
      .then((response) => {
        setData(response.data);
        setSelectedId(response.data?.students?.[0]?.student_id ?? null);
      })
      .catch((requestError) => setError(requestError.response?.data?.message ?? requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const selected = data?.students?.find((student) => student.student_id === selectedId) ?? null;
  const subjects = useMemo(() => [...new Set((selected?.projections ?? []).map((row) => row.subject))], [selected]);
  const displayName = data?.parent?.name || user?.username || "Parent";

  return (
    <div className="min-h-screen bg-background text-on-background">
      <header className="h-16 bg-white border-b border-outline-variant/20 px-4 sm:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center">
            <span className="material-symbols-outlined">school</span>
          </div>
          <div className="min-w-0">
            <p className="font-headline font-extrabold text-primary truncate">LCA Parent Portal</p>
            <p className="text-xs text-on-surface-variant">School Year {data?.schoolYear ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-bold">{displayName}</p>
            <p className="text-xs text-on-surface-variant">Parent</p>
          </div>
          <ProfileLogoutMenu displayName={displayName} avatarInitials={displayName.slice(0, 2).toUpperCase()} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-headline text-3xl font-extrabold text-primary">Assigned PACE Plan</h1>
            <p className="text-on-surface-variant mt-1">View your child’s supervisor-approved PACEs. This page is read-only.</p>
          </div>
          {(data?.students?.length ?? 0) > 1 && (
            <label className="text-xs font-bold text-on-surface-variant">
              Student
              <select value={selectedId ?? ""} onChange={(event) => setSelectedId(Number(event.target.value))}
                className="block mt-1 min-w-56 bg-white border border-outline-variant/30 rounded-lg px-3 py-2 text-sm text-on-surface">
                {data.students.map((student) => <option key={student.student_id} value={student.student_id}>{student.name}</option>)}
              </select>
            </label>
          )}
        </div>

        {error && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 p-4 text-sm">{error}</div>}
        {loading ? (
          <div className="py-16 text-center text-on-surface-variant">Loading assigned PACEs…</div>
        ) : !selected ? (
          <div className="bg-white rounded-2xl border border-outline-variant/20 p-10 text-center text-on-surface-variant">No linked student record was found.</div>
        ) : (
          <article className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
            <div className="px-6 py-5 border-b border-outline-variant/15">
              <p className="text-[10px] uppercase tracking-widest font-extrabold text-on-surface-variant">Student</p>
              <h2 className="font-headline text-xl font-extrabold text-primary">{selected.name}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-[10px] uppercase tracking-widest text-on-surface-variant">
                  <tr><th className="text-left px-5 py-3">Subject</th>{QUARTERS.map((quarter) => <th key={quarter} className="text-center px-5 py-3">Quarter {quarter}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {subjects.length ? subjects.map((subject) => (
                    <tr key={subject}>
                      <td className="px-5 py-4 font-bold">{subject}</td>
                      {QUARTERS.map((quarter) => {
                        const row = selected.projections.find((item) => item.subject === subject && item.quarter === quarter);
                        return <td key={quarter} className="px-5 py-4 text-center font-extrabold text-primary">{row ? `PACE ${paceRange(row)}` : "—"}</td>;
                      })}
                    </tr>
                  )) : <tr><td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant">The supervisor has not assigned a PACE plan yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
