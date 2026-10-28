import React from 'react';
import { Play, Sparkles, Download, Upload, FileSpreadsheet, RotateCcw, AlertTriangle, Users, Sliders } from 'lucide-react';
import { MonthlySchedulePlan } from '../types/shift';
import { exportPlanAsCsv, exportPlanAsJson } from '../utils/storage';

interface HeaderProps {
  plan: MonthlySchedulePlan;
  onAutoGenerate: () => void;
  onReset: () => void;
  onImportJson: (imported: MonthlySchedulePlan) => void;
  onOpenStaffModal: () => void;
  onOpenSettingsModal: () => void;
  onUpdateTargetMonthlyHours: (hours: number) => void;
  onChangeYearMonth: (yearMonth: string) => void;
  violationCount: number;
  isGenerating?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  plan,
  onAutoGenerate,
  onReset,
  onImportJson,
  onOpenStaffModal,
  onOpenSettingsModal,
  onUpdateTargetMonthlyHours,
  onChangeYearMonth,
  violationCount,
  isGenerating = false,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        onImportJson(parsed);
      } catch (err) {
        alert('JSONファイルの読み込みに失敗しました。正しいフォーマットかご確認ください。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 左側: タイトル & 年月 */}
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                シフト自動作成
              </h1>
              <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-600 rounded-xl shadow-xs">
                <label htmlFor="target-year-month" className="text-[10px] font-bold text-blue-600 tracking-wider whitespace-nowrap">
                  対象年月
                </label>
                <input
                  id="target-year-month"
                  type="month"
                  value={plan.yearMonth}
                  onChange={(event) => onChangeYearMonth(event.target.value)}
                  className="min-w-0 bg-transparent text-lg font-black text-blue-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                  aria-label="対象年月を選択"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              スタッフ数: <strong className="text-slate-700">{plan.staffList.length}名</strong> ｜ 常勤所定労働時間・パート週管理・FTE対応
            </p>
          </div>
        </div>

        {/* 右側: アクションボタン郡 */}
        <div className="flex items-center gap-3">
          {/* 警告インジケーター */}
          {violationCount > 0 ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <span>違反・警告 {violationCount}件</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold">
              <span>制約ルール遵守OK</span>
            </div>
          )}

          {/* スタッフ管理ボタン */}
          <button
            onClick={onOpenStaffModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 transition-colors"
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>スタッフ管理</span>
          </button>

          {/* 条件・ルール設定ボタン */}
          <button
            onClick={onOpenSettingsModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 transition-colors"
          >
            <Sliders className="w-4 h-4 text-slate-600" />
            <span>条件・ルール</span>
          </button>

          {/* 月の所定労働時間（常勤用）入力欄（自動作成ボタンの左に配置） */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50/70 border border-blue-200 rounded-lg shadow-xs">
            <div className="text-right">
              <div className="text-[10px] font-bold text-blue-800 whitespace-nowrap leading-none">
                常勤の月所定時間
              </div>
            </div>
            <div className="flex items-center">
              <input
                type="number"
                min={80}
                max={240}
                step={1}
                value={plan.targetMonthlyHours ?? 168}
                onChange={(e) => onUpdateTargetMonthlyHours(Number(e.target.value))}
                className="w-14 px-1 py-0.5 text-center font-black text-sm text-blue-900 bg-white border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs font-bold text-blue-800 ml-1">h</span>
            </div>
          </div>

          {/* 自動作成ボタン */}
          <button
            onClick={onAutoGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium rounded-lg shadow-sm transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>自動作成中...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>自動作成を実行する</span>
              </>
            )}
          </button>

          {/* CSVエクスポート */}
          <button
            onClick={() => exportPlanAsCsv(plan)}
            title="Excel形式 (CSV) で出力"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>CSV出力</span>
          </button>

          {/* JSON保存 */}
          <button
            onClick={() => exportPlanAsJson(plan)}
            title="現在のプロジェクト設定とシフトをJSONでバックアップ"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition-colors"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>保存</span>
          </button>

          {/* JSON復元 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="保存したJSONファイルを読み込み"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition-colors"
          >
            <Upload className="w-4 h-4 text-amber-600" />
            <span>復元</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* リセット */}
          <button
            onClick={onReset}
            title="手動で設定されたシフト割当をクリア"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
