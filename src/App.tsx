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
import { initDatabase, loadPlans, savePlans, migrateFromLocalStorage } from './utils/database';
import { getPreviousYearMonth } from './utils/dateUtils';

export function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [scheduleState, setScheduleState] = useState<{
    plans: Record<string, MonthlySchedulePlan>;
    selectedYearMonth: string;
  }>({
    plans: {},
    selectedYearMonth: '2026-11',
  });

  // SQLite データベースの非同期初期化とロード
  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        await initDatabase();
        await migrateFromLocalStorage();
        const savedPlans = loadPlans();

        const plans = Object.keys(savedPlans).length
          ? savedPlans
          : { '2026-11': createInitialSchedule('2026-11') };

        Object.values(plans).forEach((saved) => {
          if (saved.shiftTypes?.HOLIDAY) {
            saved.shiftTypes.HOLIDAY.shortName = '休';
          }
          if (saved.staffList) {
            saved.staffList = saved.staffList.map((staff) => ({
              ...staff,
              employmentType: (staff.employmentType as string) === 'SHORT_TIME' ? 'PART_TIME' : staff.employmentType,
              weeklyMaxHours: staff.employmentType === 'PART_TIME' ? 40 : staff.weeklyMaxHours,
              dailyWorkHours: staff.dailyWorkHours,
            }));
          }
        });

        // 初期データが未保存の場合は保存
        if (!Object.keys(savedPlans).length) {
          await savePlans(plans);
        }

        const selectedYearMonth = Object.keys(plans).sort().pop() || '2026-11';

        if (isMounted) {
          setScheduleState({ plans, selectedYearMonth });
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('データベースの初期化に失敗しました:', error);
        if (isMounted) {
          setInitializationError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  const plan = scheduleState.plans[scheduleState.selectedYearMonth];
  const previousMonthPlan = plan
    ? scheduleState.plans[getPreviousYearMonth(plan.yearMonth)]
    : undefined;
  const setPlan = (update: MonthlySchedulePlan | ((previous: MonthlySchedulePlan) => MonthlySchedulePlan)) => {
    setScheduleState((previous) => {
      const currentPlan = previous.plans[previous.selectedYearMonth];
      const nextPlan = typeof update === 'function' ? update(currentPlan) : update;
      return {
        ...previous,
        plans: { ...previous.plans, [nextPlan.yearMonth]: nextPlan },
      };
    });
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // 変更があるたびに SQLite (IndexedDB) に自動保存
  useEffect(() => {
    if (!isInitialized) return;
    savePlans(scheduleState.plans).catch((err) => {
      console.error('シフトプランの保存に失敗しました:', err);
    });
  }, [scheduleState.plans, isInitialized]);

  // リアルタイムに制約ルール違反・警告を再計算
  const validation = useMemo(() => {
    if (!plan) {
      return {
        violations: [],
        violationsByStaffAndDate: {},
        violationsByDate: {},
        staffHoursSummary: {},
        dailyCoverageSummary: {},
      };
    }
    return validateSchedule(plan, previousMonthPlan);
  }, [plan, previousMonthPlan]);

  // 自動シフト作成の実行
  const handleAutoGenerate = () => {
    setIsGenerating(true);
    // UIの描画更新を挟んでから計算実行
    setTimeout(() => {
      const generatedAssignments = generateAutomatedSchedule(plan, {
        preserveLocked: true,
        previousMonthPlan,
      });
      setPlan((prev) => ({
        ...prev,
        assignments: generatedAssignments,
        updatedAt: new Date().toISOString(),
      }));
      setIsGenerating(false);
    }, 200);
  };

  // 手動セルの更新（勝手に固定されないようにデフォルトは false）
  const handleUpdateAssignment = (
    staffId: string,
    date: string,
    shiftTypeId: ShiftTypeId,
    isLocked = false
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

  const handleUpdateShiftTypes = (shiftTypes: MonthlySchedulePlan['shiftTypes']) => {
    setPlan((prev) => {
      const removedIds = new Set(
        Object.keys(prev.shiftTypes).filter((shiftId) => !shiftTypes[shiftId])
      );
      if (removedIds.size === 0) {
        return { ...prev, shiftTypes, updatedAt: new Date().toISOString() };
      }

      const assignments = Object.fromEntries(
        Object.entries(prev.assignments).map(([key, assignment]) => [
          key,
          removedIds.has(assignment.shiftTypeId)
            ? { ...assignment, shiftTypeId: 'HOLIDAY', isRequested: false }
            : assignment,
        ])
      );
      const staffList = prev.staffList.map((staff) => ({
        ...staff,
        preferredShiftTypes: staff.preferredShiftTypes?.filter((id) => !removedIds.has(id)),
        availableShiftTypes: staff.availableShiftTypes?.filter((id) => !removedIds.has(id)),
        fixedShiftType:
          staff.fixedShiftType && removedIds.has(staff.fixedShiftType) ? undefined : staff.fixedShiftType,
        fixedDayShifts: staff.fixedDayShifts
          ? Object.fromEntries(
              Object.entries(staff.fixedDayShifts).filter(([, id]) => !id || !removedIds.has(id))
            )
          : undefined,
      }));
      const requests = prev.requests.filter((request) => !removedIds.has(request.requestedShiftId));
      const dailyRequirements = Object.fromEntries(
        Object.entries(prev.dailyRequirements || {}).map(([date, requirement]) => {
          const targetShiftCounts = { ...requirement.targetShiftCounts };
          removedIds.forEach((id) => delete targetShiftCounts[id]);
          return [date, { ...requirement, targetShiftCounts }];
        })
      );
      return {
        ...prev,
        shiftTypes,
        assignments,
        staffList,
        requests,
        dailyRequirements,
        updatedAt: new Date().toISOString(),
      };
    });
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

  const handleChangeYearMonth = (yearMonth: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return;

    setScheduleState((previous) => {
      if (previous.plans[yearMonth]) {
        return { ...previous, selectedYearMonth: yearMonth };
      }

      const currentPlan = previous.plans[previous.selectedYearMonth];
      const newPlan = {
        ...createInitialSchedule(yearMonth),
        name: `${yearMonth} シフト`,
        targetMonthlyHours: currentPlan.targetMonthlyHours,
        staffList: currentPlan.staffList.map((staff) => ({
          ...staff,
          ngStaffIds: [...staff.ngStaffIds],
          preferredShiftTypes: staff.preferredShiftTypes ? [...staff.preferredShiftTypes] : undefined,
          fixedDayShifts: staff.fixedDayShifts ? { ...staff.fixedDayShifts } : undefined,
          allowedWeeklyWorkDays: staff.allowedWeeklyWorkDays ? [...staff.allowedWeeklyWorkDays] : undefined,
          availableShiftTypes: staff.availableShiftTypes ? [...staff.availableShiftTypes] : undefined,
          dailyWorkHours: staff.dailyWorkHours,
        })),
        shiftTypes: { ...currentPlan.shiftTypes },
        assignments: {},
        dailyRequirements: {},
        requests: [],
        events: {},
        rules: {
          ...currentPlan.rules,
          defaultRequirements: { ...currentPlan.rules.defaultRequirements },
        },
        updatedAt: new Date().toISOString(),
      };

      return {
        plans: { ...previous.plans, [yearMonth]: newPlan },
        selectedYearMonth: yearMonth,
      };
    });
  };

  // リセット
  const handleReset = () => {
    if (window.confirm('シフト割当をすべてクリアしますか？（確定ロックは解除されます。スタッフ・設定・希望・行事は保持されます）')) {
      setPlan((previous) => ({
        ...previous,
        assignments: {},
        updatedAt: new Date().toISOString(),
      }));
    }
  };

  // JSON復元
  const handleImportJson = (imported: MonthlySchedulePlan) => {
    if (imported && imported.staffList && imported.assignments) {
      setScheduleState((previous) => ({
        plans: { ...previous.plans, [imported.yearMonth]: imported },
        selectedYearMonth: imported.yearMonth,
      }));
    } else {
      alert('無効なシフトデータファイルです。');
    }
  };

  if (initializationError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-100 text-slate-700 gap-3 p-6 text-center">
        <p className="text-lg font-bold">データベースの読み込みに失敗しました</p>
        <p className="text-sm">ページを再読み込みしてください。問題が続く場合は、次のエラー内容を共有してください。</p>
        <pre className="max-w-2xl overflow-auto rounded bg-white p-3 text-left text-xs">{initializationError}</pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (!isInitialized || !plan) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-100 text-slate-600 gap-3">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">データベース（SQLite）を読み込み中...</p>
      </div>
    );
  }

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
        onChangeYearMonth={handleChangeYearMonth}
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
        shiftTypes={plan.shiftTypes}
        onUpdateStaffList={handleUpdateStaffList}
      />

      {/* 条件・必要人員設定モーダル */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        rules={plan.rules}
        onUpdateRules={handleUpdateRules}
        shiftTypes={plan.shiftTypes}
        onUpdateShiftTypes={handleUpdateShiftTypes}
      />
    </div>
  );
}

export default App;
