import React from 'react';
import { Play, Sparkles, Download, Upload, FileSpreadsheet, RotateCcw, AlertTriangle } from 'lucide-react';
import { MonthlySchedulePlan } from '../types/shift';
import { exportPlanAsCsv, exportPlanAsJson } from '../utils/storage';

interface HeaderProps {
  plan: MonthlySchedulePlan;
  onAutoGenerate: () => void;
  onReset: () => void;
  onImportJson: (imported: MonthlySchedulePlan) => void;
  violationCount: number;
  isGenerating?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  plan,
  onAutoGenerate,
  onReset,
  onImportJson,
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
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                医療・介護 シフト自動作成マネージャー
              </h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
                PC専用
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              対象年月: <strong className="text-slate-700">{plan.yearMonth}</strong> ｜ スタッフ数: <strong className="text-slate-700">{plan.staffList.length}名</strong> ｜ 変形労働時間制・FTE対応
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
