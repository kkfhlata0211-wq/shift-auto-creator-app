import React from 'react';
import { AlertCircle, AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { RuleViolation } from '../types/shift';

interface ViolationPanelProps {
  violations: RuleViolation[];
}

export const ViolationPanel: React.FC<ViolationPanelProps> = ({ violations }) => {
  const [filter, setFilter] = React.useState<'ALL' | 'ERROR' | 'WARNING'>('ALL');

  const filteredViolations = violations.filter((v) => {
    if (filter === 'ALL') return true;
    return v.severity === filter;
  });

  const errorCount = violations.filter((v) => v.severity === 'ERROR').length;
  const warningCount = violations.filter((v) => v.severity === 'WARNING').length;

  return (
    <div className="bg-white border-t border-slate-200 px-6 py-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <ShieldAlert className="w-4 h-4 text-slate-700" />
            <span>リアルタイム制約チェック</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                filter === 'ALL'
                  ? 'bg-white shadow text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              すべて ({violations.length})
            </button>
            <button
              onClick={() => setFilter('ERROR')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                filter === 'ERROR'
                  ? 'bg-rose-500 text-white shadow'
                  : 'text-rose-600 hover:text-rose-700'
              }`}
            >
              重大違反 ({errorCount})
            </button>
            <button
              onClick={() => setFilter('WARNING')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                filter === 'WARNING'
                  ? 'bg-amber-500 text-white shadow'
                  : 'text-amber-600 hover:text-amber-700'
              }`}
            >
              要確認・不足 ({warningCount})
            </button>
          </div>
        </div>

        <span className="text-xs text-slate-400">
          セルの手動変更や自動生成に合わせてリアルタイムに再計算されます
        </span>
      </div>

      {violations.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 rounded-lg border border-emerald-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>すべての制約（連勤上限、夜勤ルール、NGペア、必要人数）を満たしています</span>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 max-h-24">
          {filteredViolations.map((v) => {
            const isError = v.severity === 'ERROR';
            return (
              <div
                key={v.id}
                className={`flex-shrink-0 flex items-start gap-2 p-2 rounded-lg border text-xs max-w-sm ${
                  isError
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {isError ? (
                  <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="flex items-center gap-1.5 font-semibold">
                    <span className="text-[10px] px-1 py-0.2 bg-white rounded border">
                      {v.date.slice(5)}
                    </span>
                    {v.staffName && <span>{v.staffName}</span>}
                  </div>
                  <p className="mt-0.5 leading-tight">{v.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
