import { useState, useEffect, useCallback } from "react";
import { fetchStudentRankings } from "../../api/teacher.js";

const RANK_BY = [
  { value: "points",    label: "Performance Points" },
  { value: "completed", label: "Completed Paces" },
  { value: "onTime",    label: "On-Time Paces" },
];
const TOP_OPTS = [10, 25, 50];
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Ranking tab of Student Monitoring. Ranks the teacher's students by points /
// completed / on-time (GET /teacher/student-rankings, teacher.service.getStudentRankings).
// "Top" (10/25/50) doubles as the page size.
export default function RankingTab({ grade }) {
  const [rankBy, setRankBy] = useState("points");
  const [top,    setTop]    = useState(10);   // also the page size
  const [page,   setPage]   = useState(1);
  const [data,   setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,  setError]   = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchStudentRankings({ grade, rankBy, top, page })
      .then((res) => setData(res.data ?? null))
      .catch((err) => setError(err.response?.data?.message ?? err.message ?? "Failed to load."))
      .finally(() => setLoading(false));
  }, [grade, rankBy, top, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [grade, rankBy, top]);

  const rows       = data?.rows ?? [];
  const total      = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const size       = data?.pageSize ?? top;
  const startIdx   = total ? (page - 1) * size + 1 : 0;
  const endIdx     = Math.min(page * size, total);

  return (
    <div className="p-5">
      <h3 className="text-base font-extrabold text-on-surface mb-4">Student Progress Rankings</h3>

      {/* Controls */}
      <div className="flex items-center gap-5 mb-5 flex-wrap">
       
        
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm">{error}</div>}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant/20 text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant">
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Student ID</th>
              <th className="px-4 py-3 text-left">Student Name</th>
              <th className="px-4 py-3 text-left">Grade Level</th>
              <th className="px-4 py-3 text-left">Performance Points</th>
              <th className="px-4 py-3 text-left">Completed Paces</th>
              <th className="px-4 py-3 text-left">On-Time Paces</th>
              <th className="px-4 py-3 text-left">Late Paces</th>
              <th className="px-4 py-3 text-left">Extended Paces</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-on-surface-variant"><span className="w-5 h-5 inline-block border-2 border-primary/30 border-t-primary rounded-full animate-spin align-middle" /> <span className="ml-2 align-middle text-sm">Loading…</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-on-surface-variant">No ranking data.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-outline-variant/10 hover:bg-surface-container-lowest/40">
                <td className="px-4 py-4 font-bold text-on-surface">{MEDALS[r.rank] ? <span className="text-lg">{MEDALS[r.rank]}</span> : <span className="text-primary">{r.rank}</span>}</td>
                <td className="px-4 py-4 text-on-surface-variant">{r.id}</td>
                <td className="px-4 py-4 font-bold text-on-surface">{r.name}</td>
                <td className="px-4 py-4 text-on-surface-variant">{r.gradeLevel}</td>
                <td className="px-4 py-4 font-bold text-on-surface">{r.points} pts</td>
                <td className="px-4 py-4 text-on-surface-variant">{r.completed}</td>
                <td className="px-4 py-4 text-on-surface-variant">{r.onTime}</td>
                <td className="px-4 py-4 font-bold text-red-500">{r.late}</td>
                <td className="px-4 py-4 text-on-surface-variant">{r.extended}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-4 flex-wrap gap-3">
        <p className="text-xs text-on-surface-variant">Showing {startIdx} to {endIdx} of {total} students</p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40">
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-colors ${p === page ? "bg-primary text-white" : "border border-gray-200 text-on-surface-variant hover:bg-gray-50"}`}>{p}</button>
          ))}
          {totalPages > 5 && <><span className="px-1 text-on-surface-variant">…</span>
            <button onClick={() => setPage(totalPages)} className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold ${totalPages === page ? "bg-primary text-white" : "border border-gray-200 text-on-surface-variant hover:bg-gray-50"}`}>{totalPages}</button></>}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-on-surface-variant hover:bg-gray-50 disabled:opacity-40">
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}
