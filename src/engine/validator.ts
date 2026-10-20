import { MonthlySchedulePlan, RuleViolation, ShiftTypeId } from '../types/shift';
import { getDaysInMonth } from '../utils/dateUtils';

export interface ValidationSummary {
  violations: RuleViolation[];
  violationsByStaffAndDate: Record<string, RuleViolation[]>; // key: `${staffId}_${date}`
  violationsByDate: Record<string, RuleViolation[]>;         // key: date
  staffHoursSummary: Record<string, { totalHours: number; maxHours: number; isOver: boolean }>;
  dailyCoverageSummary: Record<string, {
    requiredDay: number;
    actualDay: number;
    requiredEarly: number;
    actualEarly: number;
    requiredLate: number;
    actualLate: number;
    requiredNight: number;
    actualNight: number;
    isDeficit: boolean;
  }>;
}

export function validateSchedule(plan: MonthlySchedulePlan): ValidationSummary {
  const violations: RuleViolation[] = [];
  const violationsByStaffAndDate: Record<string, RuleViolation[]> = {};
  const violationsByDate: Record<string, RuleViolation[]> = {};
  const staffHoursSummary: Record<string, { totalHours: number; maxHours: number; isOver: boolean }> = {};
  const dailyCoverageSummary: ValidationSummary['dailyCoverageSummary'] = {};

  const days = getDaysInMonth(plan.yearMonth);
  const staffMap = new Map(plan.staffList.map((s) => [s.id, s]));

  const addViolation = (violation: RuleViolation) => {
    violations.push(violation);
    if (violation.staffId) {
      const key = `${violation.staffId}_${violation.date}`;
      if (!violationsByStaffAndDate[key]) violationsByStaffAndDate[key] = [];
      violationsByStaffAndDate[key].push(violation);
    }
    if (!violationsByDate[violation.date]) violationsByDate[violation.date] = [];
    violationsByDate[violation.date].push(violation);
  };

  // 1. 各スタッフごとのチェック（連勤、夜勤翌日、月間労働時間）
  plan.staffList.forEach((staff) => {
    let consecutiveDays = 0;
    let totalWorkHours = 0;

    days.forEach((day, index) => {
      const key = `${staff.id}_${day.date}`;
      const assignment = plan.assignments[key];
      const shiftId: ShiftTypeId | undefined = assignment?.shiftTypeId;
      const shift = shiftId ? plan.shiftTypes[shiftId] : undefined;

      // 労働時間の積算（有休も労務計算上は出勤時間として積算）
      if (shift?.isWork) {
        totalWorkHours += shift.workHours;
      }

      // 連勤日数チェック
      // 仕様: 有給休暇は連勤カウントをリセットしないが、労務計算上の出勤扱いとする（出勤＆有休は連勤にカウント）
      const countsAsWorkDay = shift?.isWork || shiftId === 'PAID_LEAVE';
      if (countsAsWorkDay) {
        consecutiveDays++;
        if (consecutiveDays > plan.rules.maxConsecutiveWorkDays) {
          addViolation({
            id: `v_consec_${staff.id}_${day.date}`,
            severity: 'ERROR',
            staffId: staff.id,
            staffName: staff.name,
            date: day.date,
            ruleType: 'CONSECUTIVE_DAYS',
            message: `${consecutiveDays}連勤です（上限: ${plan.rules.maxConsecutiveWorkDays}日）`,
          });
        }
      } else {
        // 公休・明番は連勤リセット
        consecutiveDays = 0;
      }

      // 夜勤翌日チェック
      if (shiftId === 'NIGHT' && index < days.length - 1) {
        const nextDay = days[index + 1];
        const nextKey = `${staff.id}_${nextDay.date}`;
        const nextShiftId = plan.assignments[nextKey]?.shiftTypeId;

        // 希望がある場合はそれを優先するが、日勤・早番・遅番・連続夜勤は違反
        const isPermittedNext =
          nextShiftId === 'NIGHT_NEXT' ||
          nextShiftId === 'HOLIDAY' ||
          nextShiftId === 'PAID_LEAVE';

        if (nextShiftId && !isPermittedNext) {
          addViolation({
            id: `v_night_${staff.id}_${nextDay.date}`,
            severity: 'ERROR',
            staffId: staff.id,
            staffName: staff.name,
            date: nextDay.date,
            ruleType: 'NIGHT_SHIFT_AFTERMATH',
            message: `夜勤の翌日は公休または明番である必要があります（現在: ${plan.shiftTypes[nextShiftId]?.name || nextShiftId}）`,
          });
        }
      }
    });

    // 変形労働時間・契約上限時間のチェック
    const isOver = totalWorkHours > staff.monthlyMaxHours;
    staffHoursSummary[staff.id] = {
      totalHours: totalWorkHours,
      maxHours: staff.monthlyMaxHours,
      isOver,
    };

    if (isOver) {
      addViolation({
        id: `v_hours_${staff.id}`,
        severity: 'WARNING',
        staffId: staff.id,
        staffName: staff.name,
        date: days[days.length - 1].date,
        ruleType: 'EXCEED_MONTHLY_HOURS',
        message: `月間労働時間が契約上限を超過しています（${totalWorkHours}h / 上限${staff.monthlyMaxHours}h）`,
      });
    }
  });

  // 2. 日付ごとのチェック（必要人数・NGペア）
  days.forEach((day) => {
    let dayCount = 0;
    let earlyCount = 0;
    let lateCount = 0;
    let nightCount = 0;

    const assignedStaffByShift: Partial<Record<ShiftTypeId, string[]>> = {};

    plan.staffList.forEach((staff) => {
      const key = `${staff.id}_${day.date}`;
      const shiftId = plan.assignments[key]?.shiftTypeId;
      if (!shiftId) return;

      if (!assignedStaffByShift[shiftId]) assignedStaffByShift[shiftId] = [];
      assignedStaffByShift[shiftId]!.push(staff.id);

      if (shiftId === 'DAY') dayCount++;
      if (shiftId === 'EARLY') earlyCount++;
      if (shiftId === 'LATE') lateCount++;
      if (shiftId === 'NIGHT') nightCount++;
    });

    // デフォルト必要人員（医療・介護病棟基準）: 早番1, 日勤2, 遅番1, 夜勤1
    const reqEarly = 1;
    const reqDay = 2;
    const reqLate = 1;
    const reqNight = 1;

    const isDeficit =
      earlyCount < reqEarly ||
      dayCount < reqDay ||
      lateCount < reqLate ||
      nightCount < reqNight;

    dailyCoverageSummary[day.date] = {
      requiredDay: reqDay,
      actualDay: dayCount,
      requiredEarly: reqEarly,
      actualEarly: earlyCount,
      requiredLate: reqLate,
      actualLate: lateCount,
      requiredNight: reqNight,
      actualNight: nightCount,
      isDeficit,
    };

    if (isDeficit) {
      const shortages: string[] = [];
      if (earlyCount < reqEarly) shortages.push(`早番(${earlyCount}/${reqEarly})`);
      if (dayCount < reqDay) shortages.push(`日勤(${dayCount}/${reqDay})`);
      if (lateCount < reqLate) shortages.push(`遅番(${lateCount}/${reqLate})`);
      if (nightCount < reqNight) shortages.push(`夜勤(${nightCount}/${reqNight})`);

      addViolation({
        id: `v_shortage_${day.date}`,
        severity: 'WARNING',
        date: day.date,
        ruleType: 'SHORTAGE',
        message: `人員不足: ${shortages.join(', ')}`,
      });
    }

    // NGペアチェック（同じシフトに入っているか）
    if (plan.rules.enableNgPairCheck) {
      Object.entries(assignedStaffByShift).forEach(([sId, staffIds]) => {
        if (!staffIds || staffIds.length < 2) return;
        const shiftName = plan.shiftTypes[sId as ShiftTypeId]?.name || sId;

        for (let i = 0; i < staffIds.length; i++) {
          const s1 = staffMap.get(staffIds[i]);
          if (!s1 || !s1.ngStaffIds) continue;

          for (let j = i + 1; j < staffIds.length; j++) {
            const s2Id = staffIds[j];
            if (s1.ngStaffIds.includes(s2Id)) {
              const s2 = staffMap.get(s2Id);
              addViolation({
                id: `v_ng_${s1.id}_${s2Id}_${day.date}`,
                severity: 'ERROR',
                staffId: s1.id,
                staffName: s1.name,
                date: day.date,
                ruleType: 'NG_PAIR',
                message: `NGペア重複: ${s1.name} と ${s2?.name || s2Id} が同じ【${shiftName}】に入っています`,
              });
            }
          }
        }
      });
    }
  });

  return {
    violations,
    violationsByStaffAndDate,
    violationsByDate,
    staffHoursSummary,
    dailyCoverageSummary,
  };
}
