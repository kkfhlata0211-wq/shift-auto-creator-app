import { useState, useMemo, useEffect } from 'react';
import { Header } from './components/Header';
import { ShiftMatrix } from './components/ShiftMatrix';
import { ViolationPanel } from './components/ViolationPanel';
import { StaffModal } from './components/StaffModal';
import { SettingsModal } from './components/SettingsModal';
import { MonthlySchedulePlan, ShiftTypeId, Staff, ConstraintRules, DayEvent } from './types/shift';
import { createInitialSchedule } from './mock/initialData';
import { validateSchedule } from './engine/validator';
import { generateAutomatedSchedule } from './engine/generator';
import { loadPlanFromStorage, savePlanToStorage } from './utils/storage';

export function App() {
  const [plan, setPlan] = useState<MonthlySchedulePlan>(() => {
    const saved = loadPlanFromStorage();
    if (saved) {
      // 既存データの正規化（公->休、時短->パートへの移行互換性）
      if (saved.shiftTypes?.HOLIDAY) {
        saved.shiftTypes.HOLIDAY.shortName = '休';
      }
      if (saved.staffList) {
        saved.staffList = saved.staffList.map((s: any) => ({
          ...s,
          employmentType: s.employmentType === 'SHORT_TIME' ? 'PART_TIME' : s.employmentType,
          weeklyMaxHours: s.employmentType === 'PART_TIME' ? (s.weeklyMaxHours || 40) : s.weeklyMaxHours,
        }));
      }
      return saved;
    }
    return createInitialSchedule('2026-11');
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 変更があるたびに LocalStorage に自動保存
  useEffect(() => {
    savePlanToStorage(plan);
  }, [plan]);

  // リアルタイムに制約ルール違反・警告を再計算
  const validation = useMemo(() => {
    return validateSchedule(plan);
  }, [plan]);

  // 自動シフト作成の実行
  const handleAutoGenerate = () => {
    setIsGenerating(true);
    // UIの描画更新を挟んでから計算実行
    setTimeout(() => {
      const generatedAssignments = generateAutomatedSchedule(plan, { preserveLocked: true });
      setPlan((prev) => ({
        ...prev,
        assignments: generatedAssignments,
        updatedAt: new Date().toISOString(),
      }));
      setIsGenerating(false);
    }, 200);
  };

  // 手動セルの更新
  const handleUpdateAssignment = (
    staffId: string,
    date: string,
    shiftTypeId: ShiftTypeId,
    isLocked = true
  ) => {
    const key = `${staffId}_${date}`;
    setPlan((prev) => ({
      ...prev,
      assignments: {
        ...prev.assignments,
        [key]: {
          staffId,
          date,
          shiftTypeId,
          isLocked,
          isRequested: false,
        },
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  // セルのロック切り替え
  const handleToggleLock = (staffId: string, date: string) => {
    const key = `${staffId}_${date}`;
    const current = plan.assignments[key];
    if (!current) return;

    setPlan((prev) => ({
      ...prev,
      assignments: {
        ...prev.assignments,
        [key]: {
          ...current,
          isLocked: !current.isLocked,
        },
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  // スタッフ一覧の更新
  const handleUpdateStaffList = (newStaffList: Staff[]) => {
    setPlan((prev) => ({
      ...prev,
      staffList: newStaffList,
      updatedAt: new Date().toISOString(),
    }));
  };

  // ルール・必要人員設定の更新
  const handleUpdateRules = (newRules: ConstraintRules) => {
    setPlan((prev) => ({
      ...prev,
      rules: newRules,
      updatedAt: new Date().toISOString(),
    }));
  };

  // 行事・イベントの更新・追加・削除
  const handleUpdateEvent = (date: string, event: DayEvent | null) => {
    setPlan((prev) => {
      const newEvents = { ...prev.events };
      if (event && event.title.trim()) {
        newEvents[date] = event;
      } else {
        delete newEvents[date];
      }
      return {
        ...prev,
        events: newEvents,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // 月の所定労働時間の更新
  const handleUpdateTargetMonthlyHours = (hours: number) => {
    setPlan((prev) => ({
      ...prev,
      targetMonthlyHours: hours,
      updatedAt: new Date().toISOString(),
    }));
  };

  // リセット
  const handleReset = () => {
    if (window.confirm('シフトの自動割当をクリアして初期状態に戻しますか？（確定ロックも解除されます）')) {
      const initial = createInitialSchedule(plan.yearMonth);
      setPlan(initial);
    }
  };

  // JSON復元
  const handleImportJson = (imported: MonthlySchedulePlan) => {
    if (imported && imported.staffList && imported.assignments) {
      setPlan(imported);
    } else {
      alert('無効なシフトデータファイルです。');
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100">
      {/* 上部ヘッダー */}
      <Header
        plan={plan}
        onAutoGenerate={handleAutoGenerate}
        onReset={handleReset}
        onImportJson={handleImportJson}
        onOpenStaffModal={() => setIsStaffModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onUpdateTargetMonthlyHours={handleUpdateTargetMonthlyHours}
        violationCount={validation.violations.length}
        isGenerating={isGenerating}
      />

      {/* メイン: シフト表マトリクス */}
      <ShiftMatrix
        plan={plan}
        validation={validation}
        onUpdateAssignment={handleUpdateAssignment}
        onToggleLock={handleToggleLock}
        onUpdateEvent={handleUpdateEvent}
      />

      {/* 下部: リアルタイム警告・違反ドロワー */}
      <ViolationPanel violations={validation.violations} />

      {/* スタッフ管理モーダル */}
      <StaffModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        staffList={plan.staffList}
        onUpdateStaffList={handleUpdateStaffList}
      />

      {/* 条件・必要人員設定モーダル */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        rules={plan.rules}
        onUpdateRules={handleUpdateRules}
      />
    </div>
  );
}

export default App;
