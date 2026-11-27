import {
  getNightShiftLinkRule,
  MonthlySchedulePlan,
  ShiftAssignment,
  ShiftTypeId,
  Staff,
} from '../types/shift';
import { getDaysInMonth } from '../utils/dateUtils';
import {
  getPartTimeDailyWorkHours,
  getPartTimeWeekTargetRange,
  getPartTimeWeeklyWorkDaysTarget,
  getPreviousMonthWorkStats,
  getStaffShiftWorkHours,
  PART_TIME_WEEKLY_HOURS_LIMIT,
} from './partTimeRules';

export interface GenerationOptions {
  preserveLocked?: boolean;
  previousMonthPlan?: MonthlySchedulePlan;
}

export function generateAutomatedSchedule(
  plan: MonthlySchedulePlan,
  options: GenerationOptions = { preserveLocked: true }
): Record<string, ShiftAssignment> {
  const days = getDaysInMonth(plan.yearMonth);
  const nightShiftLinkRule = getNightShiftLinkRule(plan.rules);
  const newAssignments: Record<string, ShiftAssignment> = {};
  const generationWarnings: string[] = [];
  const staffingShortageWarnings: { date: string; shiftId: ShiftTypeId; message: string }[] = [];
  const shuffle = <T>(items: T[]): T[] => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  };
  const addGenerationWarning = (message: string) => {
    generationWarnings.push(message);
  };
  const builtInShiftTypeIds = new Set([
    'EARLY',
    'DAY',
    'LATE',
    'NIGHT',
    'NIGHT_NEXT',
    'HOLIDAY',
    'PAID_LEAVE',
  ]);
  const isAutomaticCustomShiftEnabled = (shiftId: ShiftTypeId): boolean => {
    if (builtInShiftTypeIds.has(shiftId)) return true;
    const shiftType = plan.shiftTypes[shiftId];
    return Boolean(shiftType?.isWork && !shiftType.isNight && (shiftType.requiredStaff ?? 0) > 0);
  };
  const countsAsWorkDay = (shiftId?: ShiftTypeId): boolean =>
    Boolean(shiftId && plan.shiftTypes[shiftId]?.isWork) || shiftId === 'PAID_LEAVE';
  const countsAsHoliday = (shiftId?: ShiftTypeId): boolean =>
    shiftId === 'HOLIDAY' ||
    shiftId === 'PAID_LEAVE' ||
    Boolean(shiftId && shiftId !== 'NIGHT_NEXT' && plan.shiftTypes[shiftId] && !plan.shiftTypes[shiftId].isWork);
  const previousMonthStats = getPreviousMonthWorkStats(
    plan.yearMonth,
    plan.staffList,
    options.previousMonthPlan
  );

  // 1. 既存のロック済みセル・リクエストを初期設定
  if (options.preserveLocked) {
    Object.entries(plan.assignments).forEach(([key, assign]) => {
      if (assign.isLocked) {
        newAssignments[key] = { ...assign };
      }
    });
  }

  // 2. スタッフ希望休・有休の反映
  plan.requests.forEach((req) => {
    const key = `${req.staffId}_${req.date}`;
    if (!newAssignments[key] || !newAssignments[key].isLocked) {
      newAssignments[key] = {
        staffId: req.staffId,
        date: req.date,
        shiftTypeId: req.requestedShiftId,
        isLocked: false,
        isRequested: true,
      };
    }
  });

  // 2.5 パートの曜日固定シフトの反映（希望休・ロックがない場合）
  plan.staffList.forEach((staff) => {
    if (staff.employmentType === 'PART_TIME' && staff.fixedDayShifts) {
      days.forEach((day) => {
        const fixedShiftId = staff.fixedDayShifts![day.dayOfWeekIndex];
        const key = `${staff.id}_${day.date}`;
        if (
          fixedShiftId &&
          isAutomaticCustomShiftEnabled(fixedShiftId) &&
          !newAssignments[key] &&
          (!staff.availableShiftTypes || staff.availableShiftTypes.includes(fixedShiftId))
        ) {
          newAssignments[key] = {
            staffId: staff.id,
            date: day.date,
            shiftTypeId: fixedShiftId,
            isLocked: false,
            isRequested: false,
          };
        }
      });
    }
  });

  // スタッフ毎のカウンター初期化
  const staffWorkHours: Record<string, number> = {};
  const staffWeeklyWorkHours: Record<string, Record<number, number>> = {};
  const staffWeeklyWorkDaysCount: Record<string, Record<number, number>> = {};
  const staffMonthlyShiftCounts: Record<string, Partial<Record<ShiftTypeId, number>>> = {};
  const staffWeekendCounts: Record<string, number> = {};
  const staffHolidayCounts: Record<string, number> = {};
  const staffDayShiftCounts: Record<string, Partial<Record<'EARLY' | 'DAY' | 'LATE', number>>> = {};

  // スタッフごとの月間目標公休日数
  const targetHolidaysMap: Record<string, number> = {};
  const totalDays = days.length;

  plan.staffList.forEach((s) => {
    staffWorkHours[s.id] = 0;
    staffWeeklyWorkHours[s.id] = {};
    staffWeeklyWorkDaysCount[s.id] = {};
    staffMonthlyShiftCounts[s.id] = {};
    staffWeekendCounts[s.id] = 0;
    staffHolidayCounts[s.id] = 0;
    staffDayShiftCounts[s.id] = { EARLY: 0, DAY: 0, LATE: 0 };

    if (s.employmentType === 'FULL_TIME') {
      const targetHours =
        plan.targetMonthlyHours && plan.targetMonthlyHours > 0
          ? plan.targetMonthlyHours
          : (s.monthlyMaxHours ?? 168);
      const targetWorkDays = Math.round(targetHours / 8);
      targetHolidaysMap[s.id] = Math.max(s.minHolidaysPerMonth, totalDays - targetWorkDays);
    } else {
      const targetWorkDays = Math.round((s.monthlyMaxHours ?? 168) / 8);
      targetHolidaysMap[s.id] = Math.max(s.minHolidaysPerMonth, totalDays - targetWorkDays);
    }
  });

  Object.entries(previousMonthStats).forEach(([staffId, stats]) => {
    staffWeeklyWorkHours[staffId][0] = stats.workHours;
    staffWeeklyWorkDaysCount[staffId][0] = stats.workDays;
  });

  const daysByWeek = new Map<number, typeof days>();
  days.forEach((day) => {
    const weekDays = daysByWeek.get(day.weekIndex) || [];
    weekDays.push(day);
    daysByWeek.set(day.weekIndex, weekDays);
  });
  const lastWeekIndex = Math.max(...daysByWeek.keys());
  const partTimeWeeklyTargets: Record<string, Record<number, number>> = {};
  plan.staffList.forEach((staff) => {
    if (staff.employmentType !== 'PART_TIME') return;
    const targetDays = getPartTimeWeeklyWorkDaysTarget(staff);
    if (targetDays === undefined) return;

    partTimeWeeklyTargets[staff.id] = {};
    daysByWeek.forEach((weekDays, weekIndex) => {
      const isMonthEndWeek = weekIndex === lastWeekIndex;
      const hasPreviousWeekData = previousMonthStats[staff.id]?.hasData ?? false;
      const range =
        weekIndex === 0 && !isMonthEndWeek
          ? hasPreviousWeekData
            ? { min: targetDays, max: targetDays }
            : {
                min: Math.min(targetDays, weekDays.length),
                max: Math.min(targetDays, weekDays.length),
              }
          : getPartTimeWeekTargetRange(targetDays, weekDays.length, isMonthEndWeek);
      partTimeWeeklyTargets[staff.id][weekIndex] = range.max;
    });
  });

  // 正社員の各週の目標休日数（完全週7日は2日、端数週はその割合）
  const fullTimeWeeklyHolidayTargets: Record<number, { targetHolidays: number; maxWorkDays: number }> = {};
  daysByWeek.forEach((weekDays, weekIndex) => {
    const len = weekDays.length;
    if (len >= 7) {
      fullTimeWeeklyHolidayTargets[weekIndex] = { targetHolidays: 2, maxWorkDays: 5 };
    } else if (len >= 6) {
      fullTimeWeeklyHolidayTargets[weekIndex] = { targetHolidays: 2, maxWorkDays: 4 };
    } else if (len >= 4) {
      fullTimeWeeklyHolidayTargets[weekIndex] = { targetHolidays: 1, maxWorkDays: len - 1 };
    } else if (len >= 2) {
      fullTimeWeeklyHolidayTargets[weekIndex] = { targetHolidays: 1, maxWorkDays: len - 1 };
    } else {
      fullTimeWeeklyHolidayTargets[weekIndex] = { targetHolidays: 0, maxWorkDays: 1 };
    }
  });

  const getDayShiftCount = (staffId: string, shiftId: ShiftTypeId): number => {
    if (shiftId !== 'EARLY' && shiftId !== 'DAY' && shiftId !== 'LATE') return 0;
    return staffDayShiftCounts[staffId]?.[shiftId] || 0;
  };

  const addDayShiftCount = (staffId: string, shiftId: ShiftTypeId) => {
    if (shiftId !== 'EARLY' && shiftId !== 'DAY' && shiftId !== 'LATE') return;
    if (!staffDayShiftCounts[staffId]) return;
    staffDayShiftCounts[staffId][shiftId] = getDayShiftCount(staffId, shiftId) + 1;
  };

  const getMonthlyShiftCount = (staffId: string, shiftId: ShiftTypeId): number =>
    staffMonthlyShiftCounts[staffId]?.[shiftId] || 0;

  const addMonthlyShiftCount = (staffId: string, shiftId: ShiftTypeId) => {
    if (!staffMonthlyShiftCounts[staffId]) return;
    staffMonthlyShiftCounts[staffId][shiftId] =
      getMonthlyShiftCount(staffId, shiftId) + 1;
  };

  const removeMonthlyShiftCount = (staffId: string, shiftId: ShiftTypeId) => {
    if (!staffMonthlyShiftCounts[staffId]) return;
    staffMonthlyShiftCounts[staffId][shiftId] = Math.max(
      0,
      getMonthlyShiftCount(staffId, shiftId) - 1
    );
  };

  const orderByMonthlyShiftCount = (staff: Staff[], shiftId: ShiftTypeId): Staff[] =>
    shuffle(staff).sort(
      (first, second) =>
        getMonthlyShiftCount(first.id, shiftId) -
        getMonthlyShiftCount(second.id, shiftId)
    );

  // 初期リクエスト・固定・ロック済みセルの労働時間を積算
  Object.values(newAssignments).forEach((assign) => {
    const shift = plan.shiftTypes[assign.shiftTypeId];
    addDayShiftCount(assign.staffId, assign.shiftTypeId);
    addMonthlyShiftCount(assign.staffId, assign.shiftTypeId);
    if (countsAsHoliday(assign.shiftTypeId)) {
      staffHolidayCounts[assign.staffId] = (staffHolidayCounts[assign.staffId] || 0) + 1;
    }
    if (shift?.isWork) {
      const staff = plan.staffList.find((item) => item.id === assign.staffId);
      const workHours = staff ? getStaffShiftWorkHours(staff, shift) : shift.workHours;
      const day = days.find((d) => d.date === assign.date);
      if (day) {
        staffWorkHours[assign.staffId] = (staffWorkHours[assign.staffId] || 0) + workHours;
        const wIdx = day.weekIndex;
        if (!staffWeeklyWorkHours[assign.staffId]) staffWeeklyWorkHours[assign.staffId] = {};
        staffWeeklyWorkHours[assign.staffId][wIdx] = (staffWeeklyWorkHours[assign.staffId][wIdx] || 0) + workHours;

        if (!staffWeeklyWorkDaysCount[assign.staffId]) staffWeeklyWorkDaysCount[assign.staffId] = {};
        staffWeeklyWorkDaysCount[assign.staffId][wIdx] = (staffWeeklyWorkDaysCount[assign.staffId][wIdx] || 0) + 1;
      }
    }
  });

  // ヘルパー: 直近の連勤数を計算
  const getConsecutiveDaysBefore = (staffId: string, dayIndex: number): number => {
    let count = 0;
    for (let i = dayIndex - 1; i >= 0; i--) {
      const d = days[i];
      const key = `${staffId}_${d.date}`;
      const shiftId = newAssignments[key]?.shiftTypeId;
      if (countsAsWorkDay(shiftId)) {
        count++;
      } else {
        break;
      }
    }
    return count;
  };

  // ヘルパー: 直前の連続休日数を計算
  const getConsecutiveHolidaysBefore = (staffId: string, dayIndex: number): number => {
    let count = 0;
    for (let i = dayIndex - 1; i >= 0; i--) {
      const d = days[i];
      const key = `${staffId}_${d.date}`;
      const shiftId = newAssignments[key]?.shiftTypeId;
      if (countsAsHoliday(shiftId)) {
        count++;
      } else {
        break;
      }
    }
    return count;
  };

  // ヘルパー: 直前の夜勤からの経過日数を計算
  const getDaysSinceLastNight = (staffId: string, dayIndex: number): number => {
    for (let i = dayIndex - 1; i >= 0; i--) {
      const d = days[i];
      const key = `${staffId}_${d.date}`;
      if (newAssignments[key]?.shiftTypeId === 'NIGHT') {
        return dayIndex - i;
      }
    }
    return 999;
  };

  // 3. 夜勤（NIGHT）と明番（NIGHT_NEXT）の先行割り当て
  // 夜勤可能スタッフ間で回数を平準化
  const nightEligibleStaff = plan.staffList.filter(
    (staff) =>
      staff.canNightShift &&
      (!staff.availableShiftTypes || staff.availableShiftTypes.includes('NIGHT'))
  );

  const applyNightLink = (staff: Staff, nightDayIndex: number) => {
    if (nightShiftLinkRule === 'none') return;

    if (nightDayIndex < days.length - 1) {
      const nextDay = days[nightDayIndex + 1];
      const nextKey = `${staff.id}_${nextDay.date}`;
      if (!newAssignments[nextKey]) {
        newAssignments[nextKey] = {
          staffId: staff.id,
          date: nextDay.date,
          shiftTypeId: 'NIGHT_NEXT',
          isLocked: false,
          isRequested: false,
        };
      }
    }

    if (nightShiftLinkRule === 'night_next_holiday' && nightDayIndex < days.length - 2) {
      const dayAfterNext = days[nightDayIndex + 2];
      const dayAfterNextKey = `${staff.id}_${dayAfterNext.date}`;
      if (!newAssignments[dayAfterNextKey]) {
        newAssignments[dayAfterNextKey] = {
          staffId: staff.id,
          date: dayAfterNext.date,
          shiftTypeId: 'HOLIDAY',
          isLocked: false,
          isRequested: false,
        };
        staffHolidayCounts[staff.id] = (staffHolidayCounts[staff.id] || 0) + 1;
      }
    }
  };

  days.forEach((day, dayIndex) => {
    // 既に夜勤が割り当てられているか確認
    const existingNightStaff = plan.staffList.find((s) => {
      const key = `${s.id}_${day.date}`;
      return newAssignments[key]?.shiftTypeId === 'NIGHT';
    });
    if (existingNightStaff) {
      applyNightLink(existingNightStaff, dayIndex);
    }

    if (!existingNightStaff && nightEligibleStaff.length > 0) {
      // 候補スタッフの選定（連勤数、翌日の空き、累計夜勤数でソート）
      const candidates = orderByMonthlyShiftCount(
        nightEligibleStaff.filter((s) => {
          const todayKey = `${s.id}_${day.date}`;
          if (newAssignments[todayKey]) return false;
          // 連勤チェック（夜勤を入れると連勤オーバーしないか）
          const consec = getConsecutiveDaysBefore(s.id, dayIndex);
          if (consec >= plan.rules.maxConsecutiveWorkDays) return false;

          // 前回の夜勤から3日以内は夜勤不可（夜・明・休のサイクルを確保）
          const daysSinceNight = getDaysSinceLastNight(s.id, dayIndex);
          if (daysSinceNight < 4) return false;

          // 明番または休みの割当が必要なルールでは、翌日の確定勤務と衝突させない
          if (nightShiftLinkRule !== 'none' && dayIndex < days.length - 1) {
            const nextDay = days[dayIndex + 1];
            const nextKey = `${s.id}_${nextDay.date}`;
            const nextAssign = newAssignments[nextKey];
            if (nextAssign) {
              if (
                nextAssign.shiftTypeId !== 'NIGHT_NEXT' &&
                nextAssign.shiftTypeId !== 'HOLIDAY' &&
                nextAssign.shiftTypeId !== 'PAID_LEAVE'
              ) {
                return false;
              }
            }
          }

          // 夜→明→休を固定する場合だけ、翌々日の確定勤務と衝突させない
          if (nightShiftLinkRule === 'night_next_holiday' && dayIndex < days.length - 2) {
            const dayAfterNext = days[dayIndex + 2];
            const dayAfterNextKey = `${s.id}_${dayAfterNext.date}`;
            const dayAfterNextAssign = newAssignments[dayAfterNextKey];
            if (dayAfterNextAssign) {
              if (dayAfterNextAssign.shiftTypeId !== 'HOLIDAY' && dayAfterNextAssign.shiftTypeId !== 'PAID_LEAVE') {
                return false;
              }
            }
          }

          // パートは週の勤務日数を最優先で管理（月間上限時間は参考値のみ）
          if (s.employmentType === 'PART_TIME') {
            const nightHours = getStaffShiftWorkHours(s, plan.shiftTypes.NIGHT);
            const currentWeekHours = staffWeeklyWorkHours[s.id]?.[day.weekIndex] || 0;
            const targetDays = partTimeWeeklyTargets[s.id]?.[day.weekIndex];
            const currentDays = staffWeeklyWorkDaysCount[s.id]?.[day.weekIndex] || 0;
            if (currentWeekHours + nightHours > PART_TIME_WEEKLY_HOURS_LIMIT) return false;
            if (targetDays !== undefined && currentDays >= targetDays) return false;
          }

          return true;
        }),
        'NIGHT'
      );

      if (candidates.length > 0) {
        const selected = candidates[0];
        const todayKey = `${selected.id}_${day.date}`;
        newAssignments[todayKey] = {
          staffId: selected.id,
          date: day.date,
          shiftTypeId: 'NIGHT',
          isLocked: false,
          isRequested: false,
        };
        addMonthlyShiftCount(selected.id, 'NIGHT');
        const nightHours = getStaffShiftWorkHours(selected, plan.shiftTypes.NIGHT);
        staffWorkHours[selected.id] += nightHours;
        if (!staffWeeklyWorkHours[selected.id]) staffWeeklyWorkHours[selected.id] = {};
        staffWeeklyWorkHours[selected.id][day.weekIndex] =
          (staffWeeklyWorkHours[selected.id][day.weekIndex] || 0) + nightHours;
        staffWeeklyWorkDaysCount[selected.id][day.weekIndex] =
          (staffWeeklyWorkDaysCount[selected.id][day.weekIndex] || 0) + 1;

        applyNightLink(selected, dayIndex);
      } else if ((plan.rules.defaultRequirements?.NIGHT ?? 1) > 0) {
        addGenerationWarning(
          `${day.date}: 夜勤の条件を満たすスタッフがいないため、夜勤を割り当てられませんでした。`
        );
      }
    } else if (
      !existingNightStaff &&
      nightEligibleStaff.length === 0 &&
      (plan.rules.defaultRequirements?.NIGHT ?? 1) > 0
    ) {
      addGenerationWarning(`${day.date}: 夜勤可能なスタッフがいないため、夜勤を割り当てられませんでした。`);
    }
  });

  // 4. 日中のシフト割当（早番・遅番・日勤・公休）
  days.forEach((day, dayIndex) => {
    // この日に入れないといけない目標シフト枠（設定値より構築）
    const reqEarly = plan.rules.defaultRequirements?.EARLY ?? 1;
    const reqDay = plan.rules.defaultRequirements?.DAY ?? 2;
    const reqLate = plan.rules.defaultRequirements?.LATE ?? 1;

    const assignedShiftCounts: Partial<Record<ShiftTypeId, number>> = {};
    Object.values(newAssignments).forEach((assignment) => {
      if (assignment.date === day.date) {
        assignedShiftCounts[assignment.shiftTypeId] =
          (assignedShiftCounts[assignment.shiftTypeId] || 0) + 1;
      }
    });
    const neededShifts: ShiftTypeId[] = [
      ...Array(Math.max(0, reqEarly - (assignedShiftCounts.EARLY || 0))).fill('EARLY'),
      ...Array(Math.max(0, reqDay - (assignedShiftCounts.DAY || 0))).fill('DAY'),
      ...Array(Math.max(0, reqLate - (assignedShiftCounts.LATE || 0))).fill('LATE'),
      ...Object.values(plan.shiftTypes)
        .filter((shiftType) =>
          !['DAY', 'EARLY', 'LATE', 'NIGHT', 'NIGHT_NEXT', 'HOLIDAY', 'PAID_LEAVE'].includes(shiftType.id) &&
          shiftType.isWork &&
          !shiftType.isNight &&
          (shiftType.requiredStaff ?? 0) > 0
        )
        .flatMap((shiftType) =>
          Array(Math.max(0, (shiftType.requiredStaff ?? 0) - (assignedShiftCounts[shiftType.id] || 0)))
            .fill(shiftType.id)
        ),
    ];

    // 既に割当済みのスタッフを除外
    const unassignedStaff = plan.staffList.filter((s) => {
      const key = `${s.id}_${day.date}`;
      return !newAssignments[key];
    });

    const hasPartTimeWorkCapacity = (staff: Staff): boolean => {
      if (staff.employmentType !== 'PART_TIME') return false;
      const currentDays = staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0;
      const currentWeekHours = staffWeeklyWorkHours[staff.id]?.[day.weekIndex] || 0;
      const dailyHours = getPartTimeDailyWorkHours(staff);
      const targetDays = partTimeWeeklyTargets[staff.id]?.[day.weekIndex] ?? 99;

      return (
        currentDays < targetDays &&
        currentWeekHours + dailyHours <= PART_TIME_WEEKLY_HOURS_LIMIT
      );
    };

    // スコアリングソート関数（公平性とルール遵守）
    const getCandidateScore = (
      staff: Staff,
      shiftId: ShiftTypeId,
      allowLimitOverrides = false
    ): number => {
      let score = 0;
      const shiftHours = getStaffShiftWorkHours(staff, plan.shiftTypes[shiftId]);
      const consec = getConsecutiveDaysBefore(staff.id, dayIndex);
      const consecHolidays = getConsecutiveHolidaysBefore(staff.id, dayIndex);
      let consecAfter = 0;
      for (let index = dayIndex + 1; index < days.length; index++) {
        const nextShift = newAssignments[`${staff.id}_${days[index].date}`]?.shiftTypeId;
        if (!countsAsWorkDay(nextShift)) break;
        consecAfter++;
      }

      // 明けの次の日は休とする（前日が明番の場合は出勤不可）
      if (dayIndex > 0) {
        const prevDay = days[dayIndex - 1];
        const prevKey = `${staff.id}_${prevDay.date}`;
        if (
          nightShiftLinkRule === 'night_next_holiday' &&
          newAssignments[prevKey]?.shiftTypeId === 'NIGHT_NEXT'
        ) {
          return -9999;
        }
      }

      // パートの早・日・遅固定設定チェック（指定区分以外は割当不可）
      if (staff.employmentType === 'PART_TIME' && staff.fixedShiftType) {
        if (shiftId !== staff.fixedShiftType) {
          return -9999;
        }
      }

      if (staff.availableShiftTypes && !staff.availableShiftTypes.includes(shiftId)) {
        return -9999;
      }

      // 連勤上限チェック
      if (consec + 1 + consecAfter > plan.rules.maxConsecutiveWorkDays) return -9999;

      // 連勤・休日の自然なリズム（2〜3勤1休ペース）
      if (consec === 0) {
        score += 35; // 前日休みなら出勤しやすい
      } else if (consec === 1) {
        score += 15;
      } else if (consec === 2) {
        score -= 10;
      } else if (consec === 3) {
        score -= 60; // 3連勤の次は休日を優先
      }

      // 2日以上休んだ後は出勤を優先（過度な連休による他週への連勤しわ寄せを防止）
      if (consecHolidays >= 2) {
        score += 45;
      }

      const dayProgress = (dayIndex + 1) / totalDays;
      const targetHolidays = targetHolidaysMap[staff.id] || staff.minHolidaysPerMonth;
      const expectedHolidaysToDate = targetHolidays * dayProgress;
      const currentHolidays = staffHolidayCounts[staff.id] || 0;
      const holidayDeficit = expectedHolidaysToDate - currentHolidays;

      // 常勤は月間公休数を均等化し、パートは設定した週勤務日数・上限時間を優先する
      if (staff.employmentType === 'FULL_TIME') {
        if (holidayDeficit > 0.3) {
          score -= holidayDeficit * 90;
        } else if (holidayDeficit < -0.8) {
          score += 35;
        }
      }

      // パート: 週単位（最大40h）および週の勤務日数制限チェック
      // 正社員: 週休2日ペース、月単位の契約上限時間および所定労働時間の進度チェック
      if (staff.employmentType === 'PART_TIME') {
        const weekMax = PART_TIME_WEEKLY_HOURS_LIMIT;
        const currentWeekHours = staffWeeklyWorkHours[staff.id]?.[day.weekIndex] || 0;
        const targetDays = partTimeWeeklyTargets[staff.id]?.[day.weekIndex];
        const currentDays = staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0;

        // 週40h上限チェック
        if (currentWeekHours + shiftHours > weekMax) {
          return -9999;
        }

        // 週の目標勤務日数に達している場合は出勤不可（週の勤務日数を厳守）
        if (targetDays !== undefined && currentDays >= targetDays) {
          return -9999;
        }

        // 当該週の残り日数を確認し、スタッフ管理画面の週勤務日数を最優先で達成
        const weekDays = daysByWeek.get(day.weekIndex) || [];
        const pastDaysInWeek = weekDays.filter((d) => d.date <= day.date);
        const remainingDaysInWeek = weekDays.length - pastDaysInWeek.length;
        const daysNeededThisWeek = targetDays !== undefined ? targetDays - currentDays : 0;

        if (daysNeededThisWeek > 0) {
          // 今日出勤しないと週目標に届かない場合は最優先
          if (remainingDaysInWeek + 1 <= daysNeededThisWeek) {
            score += 200;
          } else {
            score += 40;
            // 連勤を避けて週全体に分散配置
            if (consec >= 1) {
              score -= 30;
            } else {
              score += 25;
            }
          }
        }
      } else {
        const monthlyMaxHours = staff.monthlyMaxHours ?? 168;
        const hoursRemaining = monthlyMaxHours - staffWorkHours[staff.id];
        if (staff.monthlyMaxHours !== undefined && staff.monthlyMaxHours > 0 && hoursRemaining < shiftHours) {
          if (!allowLimitOverrides) return -9999;
          score -= 500 + (8 - hoursRemaining) * 20;
        }

        // 正社員: 週休2日ペースの管理（各週で休日2日前後、週上限勤務日数の遵守）
        const weekTarget = fullTimeWeeklyHolidayTargets[day.weekIndex] || { targetHolidays: 2, maxWorkDays: 5 };
        const currentWeeklyDays = staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0;
        if (currentWeeklyDays >= weekTarget.maxWorkDays) {
          if (!allowLimitOverrides) return -9999;
          score -= 500 + (currentWeeklyDays - weekTarget.maxWorkDays + 1) * 100;
        } else if (currentWeeklyDays === weekTarget.maxWorkDays - 1) {
          score -= 80; // あと1日で週上限に達する場合は休日を強く推奨
        } else if (currentWeeklyDays <= 1) {
          score += 25;
        }

        // 当該週における確定済み休日数と残り日数を算出して週休2日ペースを誘導
        const weekDays = daysByWeek.get(day.weekIndex) || [];
        const pastDaysInWeek = weekDays.filter((d) => d.date <= day.date);
        const remainingDaysInWeek = weekDays.length - pastDaysInWeek.length;
        let confirmedHolidaysInWeek = 0;
        pastDaysInWeek.forEach((d) => {
          const assign = newAssignments[`${staff.id}_${d.date}`];
          if (assign && countsAsHoliday(assign.shiftTypeId)) {
            confirmedHolidaysInWeek++;
          }
        });

        if (confirmedHolidaysInWeek >= weekTarget.targetHolidays) {
          // すでに週目標休日数（2日など）を確保済みの場合は出勤しやすくする（週休過多の防止）
          score += 35;
        } else {
          // まだ週目標休日数に達していない場合、残り日数で休日を確保できるか確認
          if (remainingDaysInWeek + 1 <= (weekTarget.targetHolidays - confirmedHolidaysInWeek)) {
            // 今日休まないと目標休日数を確保できなくなるため、出勤を抑止して休日を優先
            score -= 120;
          }
        }

        // 月の所定労働時間の進度ペース（前倒し勤務の防止・月全体への均等化）
        const targetHours =
          plan.targetMonthlyHours && plan.targetMonthlyHours > 0
            ? plan.targetMonthlyHours
            : (staff.monthlyMaxHours ?? 168);
        const expectedHoursToDate = targetHours * dayProgress;
        const hourDiff = (staffWorkHours[staff.id] + shiftHours) - expectedHoursToDate;

        if (hourDiff > 8) {
          // 進度より働きすぎている場合は減点して休日を促す
          score -= hourDiff * 12;
        } else if (hourDiff < -8) {
          // 進度より遅れている場合は出勤を促す
          score += (-hourDiff) * 8;
        }

        // 目標所定労働時間を超える場合は通常割り当て禁止（所定労働時間厳守）
        if (staffWorkHours[staff.id] + shiftHours > targetHours) {
          if (!allowLimitOverrides) return -9999;
          score -= 500 + (staffWorkHours[staff.id] + shiftHours - targetHours) * 30;
        }
      }

      // 土日の出勤平準化
      if (day.isWeekend) {
        score -= (staffWeekendCounts[staff.id] || 0) * 30;
      }

      // 早番・日勤・遅番の担当回数をシフトごとに平準化
      score -= getMonthlyShiftCount(staff.id, shiftId) * 40;

      // 希望する勤務形態ボーナス
      if (staff.preferredShiftTypes?.includes(shiftId)) {
        score += 15;
      }

      // スキルレベル（日勤帯に均等に配分）
      score += staff.skillLevel * 5;

      return score;
    };

    // 必要なシフト枠を埋める
    neededShifts.forEach((shiftId) => {
      // NGペア同席回避フィルター
      const hasNgConflict = (staff: Staff) =>
        plan.rules.enableNgPairCheck &&
        Boolean(staff.ngStaffIds?.length) &&
        Object.values(newAssignments).some((assign) =>
          assign.date === day.date &&
          assign.shiftTypeId === shiftId &&
          staff.ngStaffIds.includes(assign.staffId)
        );

      const orderCandidates = (staffCandidates: Staff[], allowLimitOverrides: boolean) => {
        if (shiftId === 'EARLY' || shiftId === 'LATE') {
          return orderByMonthlyShiftCount(staffCandidates, shiftId);
        }
        return shuffle(staffCandidates).sort((a, b) => {
          const partTimePriority =
            Number(hasPartTimeWorkCapacity(b)) - Number(hasPartTimeWorkCapacity(a));
          return partTimePriority ||
            getCandidateScore(b, shiftId, allowLimitOverrides) -
              getCandidateScore(a, shiftId, allowLimitOverrides);
        });
      };

      const eligible = orderCandidates(
        unassignedStaff.filter(
          (staff) => !hasNgConflict(staff) && getCandidateScore(staff, shiftId) > -5000
        ),
        false
      );

      const emergencyEligible = eligible.length === 0
        ? orderCandidates(
            unassignedStaff.filter(
              (staff) =>
                !hasNgConflict(staff) &&
                getCandidateScore(staff, shiftId, true) > -9999
            ),
            true
          )
        : [];
      const chosen = eligible[0] || emergencyEligible[0];

      if (chosen) {
        if (eligible.length === 0) {
          addGenerationWarning(
            `${day.date}: ${plan.shiftTypes[shiftId]?.name || shiftId}は条件緩和のフォールバックで割り当てました。`
          );
        }
        const key = `${chosen.id}_${day.date}`;
        newAssignments[key] = {
          staffId: chosen.id,
          date: day.date,
          shiftTypeId: shiftId,
          isLocked: false,
          isRequested: false,
        };
        addDayShiftCount(chosen.id, shiftId);
        addMonthlyShiftCount(chosen.id, shiftId);

        const workHours = getStaffShiftWorkHours(chosen, plan.shiftTypes[shiftId]);
        staffWorkHours[chosen.id] += workHours;
        if (!staffWeeklyWorkHours[chosen.id]) staffWeeklyWorkHours[chosen.id] = {};
        staffWeeklyWorkHours[chosen.id][day.weekIndex] =
          (staffWeeklyWorkHours[chosen.id][day.weekIndex] || 0) + workHours;

        if (!staffWeeklyWorkDaysCount[chosen.id]) staffWeeklyWorkDaysCount[chosen.id] = {};
        staffWeeklyWorkDaysCount[chosen.id][day.weekIndex] =
          (staffWeeklyWorkDaysCount[chosen.id][day.weekIndex] || 0) + 1;

        if (day.isWeekend) staffWeekendCounts[chosen.id] = (staffWeekendCounts[chosen.id] || 0) + 1;

        // unassignedStaff から除外
        const idx = unassignedStaff.findIndex((s) => s.id === chosen.id);
        if (idx !== -1) unassignedStaff.splice(idx, 1);
      } else {
        const message = `${day.date}: ${plan.shiftTypes[shiftId]?.name || shiftId}の必要人数を満たせませんでした。`;
        staffingShortageWarnings.push({ date: day.date, shiftId, message });
        addGenerationWarning(message);
      }
    });

    // 枠に選ばれなかったスタッフの処理（原則は休日・公休）
    unassignedStaff.forEach((staff) => {
      const key = `${staff.id}_${day.date}`;
      const consec = getConsecutiveDaysBefore(staff.id, dayIndex);

      // 前日が明番の場合、明けの次は休（有休希望があれば有休優先）
      const prevDayWasNightNext =
        nightShiftLinkRule === 'night_next_holiday' &&
        dayIndex > 0 &&
        newAssignments[`${staff.id}_${days[dayIndex - 1].date}`]?.shiftTypeId === 'NIGHT_NEXT';

      const hasPaidLeaveReq = plan.requests.some(
        (r) => r.staffId === staff.id && r.date === day.date && r.requestedShiftId === 'PAID_LEAVE'
      );

      const isPartTime = staff.employmentType === 'PART_TIME';
      const monthlyOver =
        !isPartTime &&
        staff.monthlyMaxHours !== undefined &&
        staff.monthlyMaxHours > 0 &&
        staff.monthlyMaxHours - staffWorkHours[staff.id] < 8;

      // 正社員の週勤務日数
      const fullTimeDaysInWeek = !isPartTime
        ? (staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0)
        : 0;

      // 正社員の所定労働時間の進度管理
      const targetHours = !isPartTime
        ? (plan.targetMonthlyHours && plan.targetMonthlyHours > 0
            ? plan.targetMonthlyHours
            : (staff.monthlyMaxHours ?? 168))
        : 0;
      const remainingDays = totalDays - (dayIndex + 1);
      const remainingPotentialHours = remainingDays * 8;
      const hoursNeeded = targetHours - staffWorkHours[staff.id];
      const dayProgress = (dayIndex + 1) / totalDays;
      const expectedHoursToDate = targetHours * dayProgress;

      // 正社員で、所定労働時間を守るために今日出勤すべきか判定
      const needsShiftForTargetHours =
        !isPartTime &&
        hoursNeeded >= 8 &&
        (
          staffWorkHours[staff.id] + remainingPotentialHours <= targetHours || // 残り日数ギリギリで出勤必須
          (staffWorkHours[staff.id] + 8 <= expectedHoursToDate + 4 && fullTimeDaysInWeek < 4 && consec <= 1)
        );

      const weekTarget = fullTimeWeeklyHolidayTargets[day.weekIndex] || { targetHolidays: 2, maxWorkDays: 5 };
      const canAddExtraDayShift =
        !isPartTime &&
        needsShiftForTargetHours &&
        (!staff.availableShiftTypes || staff.availableShiftTypes.includes('DAY')) &&
        !prevDayWasNightNext &&
        !monthlyOver &&
        consec < 3 &&
        fullTimeDaysInWeek < weekTarget.maxWorkDays;

      if (canAddExtraDayShift) {
        // 追加日勤
        newAssignments[key] = {
          staffId: staff.id,
          date: day.date,
          shiftTypeId: 'DAY',
          isLocked: false,
          isRequested: false,
        };
        addDayShiftCount(staff.id, 'DAY');
        staffWorkHours[staff.id] += 8;
        if (!staffWeeklyWorkHours[staff.id]) staffWeeklyWorkHours[staff.id] = {};
        staffWeeklyWorkHours[staff.id][day.weekIndex] =
          (staffWeeklyWorkHours[staff.id][day.weekIndex] || 0) + 8;

        if (!staffWeeklyWorkDaysCount[staff.id]) staffWeeklyWorkDaysCount[staff.id] = {};
        staffWeeklyWorkDaysCount[staff.id][day.weekIndex] =
          (staffWeeklyWorkDaysCount[staff.id][day.weekIndex] || 0) + 1;

        if (day.isWeekend) staffWeekendCounts[staff.id] = (staffWeekendCounts[staff.id] || 0) + 1;
      } else {
        // 原則「休日（休）」または有休希望があれば「有休」
        const targetShift: ShiftTypeId = hasPaidLeaveReq ? 'PAID_LEAVE' : 'HOLIDAY';

        newAssignments[key] = {
          staffId: staff.id,
          date: day.date,
          shiftTypeId: targetShift,
          isLocked: false,
          isRequested: hasPaidLeaveReq,
        };
        if (targetShift === 'HOLIDAY') {
          staffHolidayCounts[staff.id] = (staffHolidayCounts[staff.id] || 0) + 1;
        } else {
          staffWorkHours[staff.id] += getStaffShiftWorkHours(
            staff,
            plan.shiftTypes[targetShift]
          );
        }
      }
    });
  });

  // パートの週勤務日数に不足があれば、空いている公休日に追加割り当てする
  plan.staffList
    .filter((staff) => staff.employmentType === 'PART_TIME')
    .forEach((staff) => {
      const weeklyTargets = partTimeWeeklyTargets[staff.id];
      if (!weeklyTargets) return;

      daysByWeek.forEach((weekDays, weekIndex) => {
        const targetDays = weeklyTargets[weekIndex];
        let currentDays = staffWeeklyWorkDaysCount[staff.id]?.[weekIndex] || 0;

        while (currentDays < targetDays) {
          const candidates = weekDays
            .map((day) => {
              const dayIndex = days.findIndex((monthDay) => monthDay.date === day.date);
              const key = `${staff.id}_${day.date}`;
              const assignment = newAssignments[key];
              if (
                assignment?.shiftTypeId !== 'HOLIDAY' ||
                assignment.isLocked ||
                assignment.isRequested
              ) {
                return null;
              }

              const fixedDayShift = staff.fixedDayShifts?.[day.dayOfWeekIndex];
              const fallbackShift = staff.availableShiftTypes?.includes('DAY')
                ? 'DAY'
                : staff.availableShiftTypes?.find(
                    (id) =>
                      plan.shiftTypes[id]?.isWork &&
                      !plan.shiftTypes[id]?.isNight &&
                      id !== 'PAID_LEAVE' &&
                      isAutomaticCustomShiftEnabled(id)
                  );
              const shiftId = fixedDayShift || staff.fixedShiftType || fallbackShift || 'DAY';
              if (shiftId === 'HOLIDAY' || !plan.shiftTypes[shiftId]?.isWork || plan.shiftTypes[shiftId]?.isNight) {
                return null;
              }
              if (!isAutomaticCustomShiftEnabled(shiftId)) return null;
              if (staff.availableShiftTypes && !staff.availableShiftTypes.includes(shiftId)) return null;

              const shift = plan.shiftTypes[shiftId];
              const workHours = getStaffShiftWorkHours(staff, shift);
              const currentWeekHours = staffWeeklyWorkHours[staff.id]?.[weekIndex] || 0;
              if (
                !shift?.isWork ||
                currentWeekHours + workHours > PART_TIME_WEEKLY_HOURS_LIMIT
              ) {
                return null;
              }

              if (
                plan.rules.enableNgPairCheck &&
                staff.ngStaffIds?.some((ngStaffId) =>
                  Object.values(newAssignments).some(
                    (other) =>
                      other.date === day.date &&
                      other.shiftTypeId === shiftId &&
                      other.staffId === ngStaffId
                  )
                )
              ) {
                return null;
              }

              if (dayIndex > 0) {
                const previousShiftId =
                  newAssignments[`${staff.id}_${days[dayIndex - 1].date}`]?.shiftTypeId;
                if (
                  nightShiftLinkRule === 'night_next_holiday' &&
                  previousShiftId === 'NIGHT_NEXT'
                ) return null;
              }

              let consecutiveDays = 1;
              for (let index = dayIndex - 1; index >= 0; index--) {
                const previousShiftId =
                  newAssignments[`${staff.id}_${days[index].date}`]?.shiftTypeId;
                if (!previousShiftId || previousShiftId === 'HOLIDAY' || previousShiftId === 'NIGHT_NEXT') break;
                consecutiveDays++;
              }
              for (let index = dayIndex + 1; index < days.length; index++) {
                const nextShiftId =
                  newAssignments[`${staff.id}_${days[index].date}`]?.shiftTypeId;
                if (!nextShiftId || nextShiftId === 'HOLIDAY' || nextShiftId === 'NIGHT_NEXT') break;
                consecutiveDays++;
              }
              if (consecutiveDays > plan.rules.maxConsecutiveWorkDays) return null;

              return { day, key, shiftId, workHours };
            })
            .filter(
              (
                candidate
              ): candidate is {
                day: (typeof days)[number];
                key: string;
                shiftId: ShiftTypeId;
                workHours: number;
              } => candidate !== null
            );

          const chosen = shuffle(candidates)[0];
          if (!chosen) break;

          newAssignments[chosen.key] = {
            staffId: staff.id,
            date: chosen.day.date,
            shiftTypeId: chosen.shiftId,
            isLocked: false,
            isRequested: false,
          };
          addDayShiftCount(staff.id, chosen.shiftId);
          addMonthlyShiftCount(staff.id, chosen.shiftId);
          staffWorkHours[staff.id] += chosen.workHours;
          staffWeeklyWorkHours[staff.id][weekIndex] =
            (staffWeeklyWorkHours[staff.id][weekIndex] || 0) + chosen.workHours;
          staffWeeklyWorkDaysCount[staff.id][weekIndex] = currentDays + 1;
          currentDays++;
          staffHolidayCounts[staff.id] = Math.max(0, (staffHolidayCounts[staff.id] || 0) - 1);
          if (chosen.day.isWeekend) {
            staffWeekendCounts[staff.id] = (staffWeekendCounts[staff.id] || 0) + 1;
          }
        }

        // 週目標日数を超過している場合、余分な出勤（ロック・希望・曜日固定でない日勤等）を休日に戻す
        while (currentDays > targetDays) {
          const excessCandidates = weekDays
            .map((day) => {
              const key = `${staff.id}_${day.date}`;
              const assignment = newAssignments[key];
              if (!assignment || assignment.isLocked || assignment.isRequested) return null;
              const assignmentShift = plan.shiftTypes[assignment.shiftTypeId];
              if (!assignmentShift?.isWork || assignmentShift.isNight || assignment.shiftTypeId === 'PAID_LEAVE') {
                return null;
              }
              const assignedOfType = Object.values(newAssignments).filter(
                (other) => other.date === day.date && other.shiftTypeId === assignment.shiftTypeId
              ).length;
              if (
                !['DAY', 'EARLY', 'LATE'].includes(assignment.shiftTypeId) &&
                assignedOfType <= (assignmentShift.requiredStaff ?? 0)
              ) return null;
              if (staff.fixedDayShifts?.[day.dayOfWeekIndex]) return null;
              return { day, key, shiftTypeId: assignment.shiftTypeId };
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);

          const chosenExcess = shuffle(excessCandidates)[0];
          if (!chosenExcess) break;

          newAssignments[chosenExcess.key] = {
            staffId: staff.id,
            date: chosenExcess.day.date,
            shiftTypeId: 'HOLIDAY',
            isLocked: false,
            isRequested: false,
          };
          const shift = plan.shiftTypes[chosenExcess.shiftTypeId];
          const workHours = shift ? getStaffShiftWorkHours(staff, shift) : 8;
          staffWorkHours[staff.id] -= workHours;
          staffWeeklyWorkHours[staff.id][weekIndex] = Math.max(
            0,
            (staffWeeklyWorkHours[staff.id][weekIndex] || 0) - workHours
          );
          staffWeeklyWorkDaysCount[staff.id][weekIndex] = currentDays - 1;
          removeMonthlyShiftCount(staff.id, chosenExcess.shiftTypeId);
          currentDays--;
          staffHolidayCounts[staff.id] = (staffHolidayCounts[staff.id] || 0) + 1;
        }

        if (currentDays !== targetDays) {
          addGenerationWarning(
            `${staff.name}: 第${weekIndex + 1}週は固定・希望・夜勤などの条件により、勤務日数を目標${targetDays}日にできませんでした（現在${currentDays}日）。`
          );
        }
      });
    });

  // 4. 正社員の労働時間を常勤所定労働時間（targetMonthlyHours）に完全合致させる事後調整パス
  const fullTimeStaff = plan.staffList.filter((s) => s.employmentType === 'FULL_TIME');

  fullTimeStaff.forEach((staff) => {
    const targetHours =
      plan.targetMonthlyHours && plan.targetMonthlyHours > 0
        ? plan.targetMonthlyHours
        : (staff.monthlyMaxHours ?? 168);
    let currentHours = staffWorkHours[staff.id] || 0;
    const diff = targetHours - currentHours;

    if (diff === 0) return; // 既に目標時間に合致

    if (diff > 0) {
      // 不足している場合: 休日（HOLIDAY）を日勤（DAY）に変更して合致させる
      let daysNeeded = Math.round(diff / 8);

      for (let pass = 0; pass < 2 && daysNeeded > 0; pass++) {
        const candidateDays = shuffle(
          days
          .map((day, dIdx) => {
            const key = `${staff.id}_${day.date}`;
            const assign = newAssignments[key];
            if (!assign || assign.shiftTypeId !== 'HOLIDAY' || assign.isLocked || assign.isRequested) {
              return null;
            }
            if (staff.availableShiftTypes && !staff.availableShiftTypes.includes('DAY')) return null;

            // 前日が夜勤または明番の場合は不可（夜勤サイクル保護）
            if (dIdx > 0) {
              const prevKey = `${staff.id}_${days[dIdx - 1].date}`;
              const prevShift = newAssignments[prevKey]?.shiftTypeId;
              if (
                (nightShiftLinkRule !== 'none' && prevShift === 'NIGHT') ||
                (nightShiftLinkRule === 'night_next_holiday' && prevShift === 'NIGHT_NEXT')
              ) return null;
            }

            // 翌日が明番の場合は不可
            if (dIdx < days.length - 1) {
              const nextKey = `${staff.id}_${days[dIdx + 1].date}`;
              const nextShift = newAssignments[nextKey]?.shiftTypeId;
              if (nightShiftLinkRule !== 'none' && nextShift === 'NIGHT_NEXT') return null;
            }

            // 週の勤務日数
            const weekTarget = fullTimeWeeklyHolidayTargets[day.weekIndex] || { targetHolidays: 2, maxWorkDays: 5 };
            const weekDays = staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0;
            const maxWeekAllowed = pass === 0 ? weekTarget.maxWorkDays : weekTarget.maxWorkDays + 1;
            if (weekDays >= maxWeekAllowed) return null;

            // 週の現在の休日数（HOLIDAY + PAID_LEAVE）
            const weekDaysList = daysByWeek.get(day.weekIndex) || [];
            const weeklyHolidays = weekDaysList.filter((d) => {
              const a = newAssignments[`${staff.id}_${d.date}`];
              return a && countsAsHoliday(a.shiftTypeId);
            }).length;

            // 連勤チェック
            let forwardCount = 0;
            for (let f = dIdx + 1; f < days.length; f++) {
              const fShift = newAssignments[`${staff.id}_${days[f].date}`]?.shiftTypeId;
              if (fShift && fShift !== 'HOLIDAY' && fShift !== 'NIGHT_NEXT') forwardCount++;
              else break;
            }
            let backwardCount = 0;
            for (let b = dIdx - 1; b >= 0; b--) {
              const bShift = newAssignments[`${staff.id}_${days[b].date}`]?.shiftTypeId;
              if (bShift && bShift !== 'HOLIDAY' && bShift !== 'NIGHT_NEXT') backwardCount++;
              else break;
            }
            const totalConsec = backwardCount + 1 + forwardCount;
            if (totalConsec > plan.rules.maxConsecutiveWorkDays) return null;

            // スコアリング（休日が目標より多い週を最優先で出勤に変更。2日以下の週は極力維持）
            let holidayScore = 0;
            if (weeklyHolidays > weekTarget.targetHolidays) {
              holidayScore += (weeklyHolidays - weekTarget.targetHolidays) * 80;
            } else {
              holidayScore -= 120;
            }

            const score = holidayScore + (weekTarget.maxWorkDays - weekDays) * 20 - totalConsec * 10;
            return { day, dIdx, score };
          })
          .filter((item): item is { day: (typeof days)[0]; dIdx: number; score: number } => item !== null)
        )
          .sort((a, b) => b.score - a.score);

        for (const candidate of candidateDays) {
          if (daysNeeded <= 0) break;

          // 変更直前に最新の状態で連勤チェック
          let fCount = 0;
          for (let f = candidate.dIdx + 1; f < days.length; f++) {
            const fShift = newAssignments[`${staff.id}_${days[f].date}`]?.shiftTypeId;
            if (fShift && fShift !== 'HOLIDAY' && fShift !== 'NIGHT_NEXT') fCount++;
            else break;
          }
          let bCount = 0;
          for (let b = candidate.dIdx - 1; b >= 0; b--) {
            const bShift = newAssignments[`${staff.id}_${days[b].date}`]?.shiftTypeId;
            if (bShift && bShift !== 'HOLIDAY' && bShift !== 'NIGHT_NEXT') bCount++;
            else break;
          }
          if (bCount + 1 + fCount > plan.rules.maxConsecutiveWorkDays) {
            continue;
          }

          const key = `${staff.id}_${candidate.day.date}`;
          newAssignments[key] = {
            staffId: staff.id,
            date: candidate.day.date,
            shiftTypeId: 'DAY',
            isLocked: false,
            isRequested: false,
          };
          addDayShiftCount(staff.id, 'DAY');
          staffWorkHours[staff.id] += 8;
          staffHolidayCounts[staff.id] = Math.max(0, (staffHolidayCounts[staff.id] || 0) - 1);
          if (!staffWeeklyWorkHours[staff.id]) staffWeeklyWorkHours[staff.id] = {};
          staffWeeklyWorkHours[staff.id][candidate.day.weekIndex] =
            (staffWeeklyWorkHours[staff.id][candidate.day.weekIndex] || 0) + 8;
          if (!staffWeeklyWorkDaysCount[staff.id]) staffWeeklyWorkDaysCount[staff.id] = {};
          staffWeeklyWorkDaysCount[staff.id][candidate.day.weekIndex] =
            (staffWeeklyWorkDaysCount[staff.id][candidate.day.weekIndex] || 0) + 1;
          daysNeeded--;
        }
      }
    } else if (diff < 0) {
      // 超過している場合: 日勤帯（DAY, EARLY, LATE）を休日（HOLIDAY）に変更して合致させる
      let daysToRemove = Math.round((-diff) / 8);

      const candidateDays = shuffle(
        days
        .map((day, dIdx) => {
          const key = `${staff.id}_${day.date}`;
          const assign = newAssignments[key];
          if (!assign || assign.isLocked || assign.isRequested) return null;
          // 日勤帯のみ休日に変更可能（夜勤・明番・有休は除外）
          if (
            assign.shiftTypeId !== 'DAY' &&
            assign.shiftTypeId !== 'EARLY' &&
            assign.shiftTypeId !== 'LATE'
          ) {
            return null;
          }

          // その日の全体の出勤人数を計算（人数に余裕がある日を優先）
          const dayAssignments = Object.values(newAssignments).filter(
            (a) =>
              a.date === day.date &&
              a.shiftTypeId !== 'HOLIDAY' &&
              a.shiftTypeId !== 'NIGHT_NEXT'
          );
          const totalWorking = dayAssignments.length;
          const weekDays = staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0;

          // 週の現在の休日数（HOLIDAY + PAID_LEAVE）
          const weekTarget = fullTimeWeeklyHolidayTargets[day.weekIndex] || { targetHolidays: 2, maxWorkDays: 5 };
          const weekDaysList = daysByWeek.get(day.weekIndex) || [];
          const weeklyHolidays = weekDaysList.filter((d) => {
            const a = newAssignments[`${staff.id}_${d.date}`];
            return a && countsAsHoliday(a.shiftTypeId);
          }).length;

          // スコア: その週の休日が少ない（目標以下）週を最優先で休みにする
          let holidayBonus = 0;
          if (weeklyHolidays < weekTarget.targetHolidays) {
            holidayBonus += (weekTarget.targetHolidays - weeklyHolidays) * 80;
          } else if (weeklyHolidays >= weekTarget.targetHolidays) {
            holidayBonus -= 80; // すでに目標休日数があるならこれ以上増やさない
          }

          // スコア: 現場人数が多い日ほど安全、週勤務日数が多いほど休みにしたい
          const score = holidayBonus + totalWorking * 20 + weekDays * 15;
          return { day, dIdx, assign, score };
        })
        .filter(
          (
            item
          ): item is {
            day: (typeof days)[0];
            dIdx: number;
            assign: (typeof newAssignments)[string];
            score: number;
          } => item !== null
        )
      )
        .sort((a, b) => b.score - a.score);

      for (const candidate of candidateDays) {
        if (daysToRemove <= 0) break;
        const key = `${staff.id}_${candidate.day.date}`;
        newAssignments[key] = {
          staffId: staff.id,
          date: candidate.day.date,
          shiftTypeId: 'HOLIDAY',
          isLocked: false,
          isRequested: false,
        };
        staffWorkHours[staff.id] -= 8;
        staffHolidayCounts[staff.id] = (staffHolidayCounts[staff.id] || 0) + 1;
        if (staffWeeklyWorkHours[staff.id]) {
          staffWeeklyWorkHours[staff.id][candidate.day.weekIndex] = Math.max(
            0,
            (staffWeeklyWorkHours[staff.id][candidate.day.weekIndex] || 0) - 8
          );
        }
        if (staffWeeklyWorkDaysCount[staff.id]) {
          staffWeeklyWorkDaysCount[staff.id][candidate.day.weekIndex] = Math.max(
            0,
            (staffWeeklyWorkDaysCount[staff.id][candidate.day.weekIndex] || 0) - 1
          );
        }
        daysToRemove--;
      }
    }

    if ((staffWorkHours[staff.id] || 0) !== targetHours) {
      addGenerationWarning(
        `${staff.name}: 制約の競合により月間労働時間を目標${targetHours}時間に調整できませんでした（現在${staffWorkHours[staff.id] || 0}時間）。`
      );
    }
  });

  // 5. 正社員の各週休日平準化スワップパス（完全週の休日が2日前後になるよう平準化）
  fullTimeStaff.forEach((staff) => {
    const getWeekHolidays = (weekIdx: number) => {
      const wDays = daysByWeek.get(weekIdx) || [];
      return wDays.filter((d) => {
        const a = newAssignments[`${staff.id}_${d.date}`];
        return a && countsAsHoliday(a.shiftTypeId);
      }).length;
    };

    const checkConsecutiveOk = (targetDayIdx: number, newShiftId: ShiftTypeId): boolean => {
      let forwardCount = 0;
      for (let f = targetDayIdx + 1; f < days.length; f++) {
        const fShift = f === targetDayIdx ? newShiftId : newAssignments[`${staff.id}_${days[f].date}`]?.shiftTypeId;
        if (fShift && fShift !== 'HOLIDAY' && fShift !== 'NIGHT_NEXT') forwardCount++;
        else break;
      }
      let backwardCount = 0;
      for (let b = targetDayIdx - 1; b >= 0; b--) {
        const bShift = b === targetDayIdx ? newShiftId : newAssignments[`${staff.id}_${days[b].date}`]?.shiftTypeId;
        if (bShift && bShift !== 'HOLIDAY' && bShift !== 'NIGHT_NEXT') backwardCount++;
        else break;
      }
      const totalConsec = newShiftId === 'HOLIDAY' ? 0 : backwardCount + 1 + forwardCount;
      return totalConsec <= plan.rules.maxConsecutiveWorkDays;
    };

    for (let iter = 0; iter < 5; iter++) {
      let surplusWeek: number | null = null;
      let deficitWeek: number | null = null;

      shuffle([...daysByWeek.keys()]).forEach((wIdx) => {
        const target = fullTimeWeeklyHolidayTargets[wIdx]?.targetHolidays ?? 2;
        const holidays = getWeekHolidays(wIdx);
        if (holidays > target && surplusWeek === null) {
          surplusWeek = wIdx;
        } else if (holidays < target && deficitWeek === null) {
          deficitWeek = wIdx;
        }
      });

      if (surplusWeek === null || deficitWeek === null) break;

      // surplusWeek の中から DAY に変更可能な HOLIDAY を探索
      const surplusDays = daysByWeek.get(surplusWeek) || [];
      const holidayCandidates = shuffle(surplusDays)
        .map((d) => {
          const dIdx = days.findIndex((mDay) => mDay.date === d.date);
          const key = `${staff.id}_${d.date}`;
          const assign = newAssignments[key];
          if (!assign || assign.shiftTypeId !== 'HOLIDAY' || assign.isLocked || assign.isRequested) {
            return null;
          }
          if (dIdx > 0) {
            const prevShift = newAssignments[`${staff.id}_${days[dIdx - 1].date}`]?.shiftTypeId;
            if (
              (nightShiftLinkRule !== 'none' && prevShift === 'NIGHT') ||
              (nightShiftLinkRule === 'night_next_holiday' && prevShift === 'NIGHT_NEXT')
            ) return null;
          }
          if (dIdx < days.length - 1) {
            const nextShift = newAssignments[`${staff.id}_${days[dIdx + 1].date}`]?.shiftTypeId;
            if (nightShiftLinkRule !== 'none' && nextShift === 'NIGHT_NEXT') return null;
          }
          if (!checkConsecutiveOk(dIdx, 'DAY')) return null;
          return { day: d, dIdx, key };
        })
        .filter((c): c is { day: (typeof days)[0]; dIdx: number; key: string } => c !== null);

      // deficitWeek の中から HOLIDAY に変更可能な DAY/EARLY/LATE を探索
      const deficitDays = daysByWeek.get(deficitWeek) || [];
      const workCandidates = shuffle(deficitDays)
        .map((d) => {
          const dIdx = days.findIndex((mDay) => mDay.date === d.date);
          const key = `${staff.id}_${d.date}`;
          const assign = newAssignments[key];
          if (!assign || assign.isLocked || assign.isRequested) return null;
          if (assign.shiftTypeId !== 'DAY' && assign.shiftTypeId !== 'EARLY' && assign.shiftTypeId !== 'LATE') {
            return null;
          }
          const dayWorking = Object.values(newAssignments).filter(
            (a) => a.date === d.date && a.shiftTypeId !== 'HOLIDAY' && a.shiftTypeId !== 'NIGHT_NEXT'
          ).length;
          return { day: d, dIdx, key, dayWorking };
        })
        .filter((c): c is { day: (typeof days)[0]; dIdx: number; key: string; dayWorking: number } => c !== null)
        .sort((a, b) => b.dayWorking - a.dayWorking);

      if (holidayCandidates.length === 0 || workCandidates.length === 0) break;

      const toWork = holidayCandidates[0];
      const toHoliday = workCandidates[0];

      newAssignments[toWork.key] = {
        staffId: staff.id,
        date: toWork.day.date,
        shiftTypeId: 'DAY',
        isLocked: false,
        isRequested: false,
      };
      newAssignments[toHoliday.key] = {
        staffId: staff.id,
        date: toHoliday.day.date,
        shiftTypeId: 'HOLIDAY',
        isLocked: false,
        isRequested: false,
      };

      staffWeeklyWorkDaysCount[staff.id][surplusWeek] =
        (staffWeeklyWorkDaysCount[staff.id][surplusWeek] || 0) + 1;
      staffWeeklyWorkDaysCount[staff.id][deficitWeek] = Math.max(
        0,
        (staffWeeklyWorkDaysCount[staff.id][deficitWeek] || 0) - 1
      );
    }

    daysByWeek.forEach((_weekDays, weekIndex) => {
      const target = fullTimeWeeklyHolidayTargets[weekIndex]?.targetHolidays ?? 2;
      const actual = getWeekHolidays(weekIndex);
      if (actual !== target) {
        addGenerationWarning(
          `${staff.name}: 第${weekIndex + 1}週の休日数は条件の競合により目標${target}日ではなく${actual}日です。`
        );
      }
    });
  });

  // 6. 同日の余剰シフトから不足シフトへ振り替え、必要人数を補う
  const requiredByShift: Partial<Record<ShiftTypeId, number>> = {
    EARLY: plan.rules.defaultRequirements?.EARLY ?? 1,
    DAY: plan.rules.defaultRequirements?.DAY ?? 2,
    LATE: plan.rules.defaultRequirements?.LATE ?? 1,
    NIGHT: plan.rules.defaultRequirements?.NIGHT ?? 1,
  };
  const customWorkShifts = Object.values(plan.shiftTypes).filter(
    (shiftType) =>
      !builtInShiftTypeIds.has(shiftType.id) &&
      shiftType.isWork &&
      !shiftType.isNight
  );
  customWorkShifts.forEach((shiftType) => {
    requiredByShift[shiftType.id] = shiftType.requiredStaff ?? 0;
  });

  const parseShiftTime = (time: string): number | null => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const getShiftTimeRange = (shiftId: ShiftTypeId) => {
    const shiftType = plan.shiftTypes[shiftId];
    if (!shiftType) return null;
    const start = parseShiftTime(shiftType.startTime);
    const end = parseShiftTime(shiftType.endTime);
    if (start === null || end === null) return null;
    return { start, end: end <= start ? end + 1440 : end };
  };
  const getAssignedShiftId = (
    staffId: string,
    dayIndex: number,
    overrides: Record<string, ShiftTypeId> = {}
  ): ShiftTypeId | undefined => {
    const key = `${staffId}_${days[dayIndex].date}`;
    return overrides[key] ?? newAssignments[key]?.shiftTypeId;
  };
  const hasRequiredRest = (
    staffId: string,
    dayIndex: number,
    shiftId: ShiftTypeId,
    overrides: Record<string, ShiftTypeId> = {}
  ): boolean => {
    const minimumRest = plan.rules.minRestHoursBetweenShifts;
    if (minimumRest <= 0) return true;
    const targetRange = getShiftTimeRange(shiftId);
    if (!targetRange) return false;

    if (dayIndex > 0) {
      const previousShiftId = getAssignedShiftId(staffId, dayIndex - 1, overrides);
      const previousShift = previousShiftId ? plan.shiftTypes[previousShiftId] : undefined;
      if (previousShift?.isWork && previousShiftId !== 'PAID_LEAVE' && previousShiftId) {
        const previousRange = getShiftTimeRange(previousShiftId);
        if (!previousRange || 24 * 60 + targetRange.start - previousRange.end < minimumRest * 60) {
          return false;
        }
      }
    }

    if (dayIndex < days.length - 1) {
      const nextShiftId = getAssignedShiftId(staffId, dayIndex + 1, overrides);
      const nextShift = nextShiftId ? plan.shiftTypes[nextShiftId] : undefined;
      if (nextShift?.isWork && nextShiftId !== 'PAID_LEAVE' && nextShiftId) {
        const nextRange = getShiftTimeRange(nextShiftId);
        if (!nextRange || 24 * 60 + nextRange.start - targetRange.end < minimumRest * 60) {
          return false;
        }
      }
    }
    return true;
  };
  const canKeepNightLink = (
    staff: Staff,
    dayIndex: number,
    targetShiftId: ShiftTypeId,
    overrides: Record<string, ShiftTypeId> = {}
  ): boolean => {
    const previousShiftId =
      dayIndex > 0
        ? getAssignedShiftId(staff.id, dayIndex - 1, overrides)
        : undefined;
    const nextShiftId =
      dayIndex < days.length - 1
        ? getAssignedShiftId(staff.id, dayIndex + 1, overrides)
        : undefined;

    if (targetShiftId !== 'NIGHT') {
      if (
        nightShiftLinkRule !== 'none' &&
        previousShiftId === 'NIGHT'
      ) return false;
      if (
        nightShiftLinkRule === 'night_next_holiday' &&
        previousShiftId === 'NIGHT_NEXT'
      ) return false;
      if (nightShiftLinkRule !== 'none' && nextShiftId === 'NIGHT_NEXT') return false;
      return true;
    }

    if (!staff.canNightShift || getDaysSinceLastNight(staff.id, dayIndex) < 4) return false;
    for (let index = dayIndex + 1; index < days.length; index++) {
      if (
        getAssignedShiftId(staff.id, index, overrides) === 'NIGHT' &&
        index - dayIndex < 4
      ) return false;
    }

    if (nightShiftLinkRule === 'none') return true;
    const nextAssignmentKey =
      dayIndex < days.length - 1
        ? `${staff.id}_${days[dayIndex + 1].date}`
        : undefined;
    const nextAssignment = nextAssignmentKey ? newAssignments[nextAssignmentKey] : undefined;
    const nextAssignmentShiftId = nextAssignmentKey ? overrides[nextAssignmentKey] ?? nextAssignment?.shiftTypeId : undefined;
    if (
      nextAssignment &&
      nextAssignmentShiftId !== 'NIGHT_NEXT' &&
      nextAssignmentShiftId !== 'PAID_LEAVE' &&
      !(
        nextAssignmentShiftId === 'HOLIDAY' &&
        !nextAssignment.isLocked &&
        !nextAssignment.isRequested
      )
    ) return false;

    if (nightShiftLinkRule === 'night_next_holiday' && dayIndex < days.length - 2) {
      const dayAfterKey = `${staff.id}_${days[dayIndex + 2].date}`;
      const dayAfterAssignment = newAssignments[dayAfterKey];
      const dayAfterShiftId = overrides[dayAfterKey] ?? dayAfterAssignment?.shiftTypeId;
      if (
        dayAfterAssignment &&
        dayAfterShiftId !== 'HOLIDAY' &&
        dayAfterShiftId !== 'PAID_LEAVE'
      ) return false;
    }
    return true;
  };

  days.forEach((day, dayIndex) => {
    const shiftCounts: Partial<Record<ShiftTypeId, number>> = {};
    plan.staffList.forEach((staff) => {
      const shiftId = newAssignments[`${staff.id}_${day.date}`]?.shiftTypeId;
      if (shiftId) shiftCounts[shiftId] = (shiftCounts[shiftId] || 0) + 1;
    });

    const targetShiftIds: ShiftTypeId[] = [
      'EARLY',
      'LATE',
      'NIGHT',
      ...customWorkShifts.map((shiftType) => shiftType.id),
    ];

    targetShiftIds.forEach((targetShiftId) => {
      const requiredCount = requiredByShift[targetShiftId] ?? 0;
      while ((shiftCounts[targetShiftId] || 0) < requiredCount) {
        const sources = Object.keys(requiredByShift)
          .filter((sourceShiftId) => {
            const sourceRequired = requiredByShift[sourceShiftId] ?? 0;
            return (shiftCounts[sourceShiftId] || 0) > sourceRequired;
          })
          .sort(
            (first, second) =>
              (shiftCounts[second] || 0) - (requiredByShift[second] || 0) -
              ((shiftCounts[first] || 0) - (requiredByShift[first] || 0))
          );
        let reassignment:
          | { staff: Staff; sourceShiftId: ShiftTypeId; sourceHours: number; targetHours: number }
          | undefined;

        for (const sourceShiftId of sources) {
          const sourceShift = plan.shiftTypes[sourceShiftId];
          const targetShift = plan.shiftTypes[targetShiftId];
          if (!sourceShift?.isWork || sourceShift.isNight || !targetShift?.isWork) continue;

          const candidates = orderByMonthlyShiftCount(
            plan.staffList.filter((staff) => {
              const key = `${staff.id}_${day.date}`;
              const assignment = newAssignments[key];
              if (
                !assignment ||
                assignment.shiftTypeId !== sourceShiftId ||
                assignment.isLocked ||
                assignment.isRequested
              ) return false;
              if (staff.availableShiftTypes && !staff.availableShiftTypes.includes(targetShiftId)) {
                return false;
              }
              if (
                staff.employmentType === 'PART_TIME' &&
                staff.fixedShiftType &&
                staff.fixedShiftType !== targetShiftId
              ) return false;
              const fixedDayShift = staff.fixedDayShifts?.[day.dayOfWeekIndex];
              if (fixedDayShift && fixedDayShift !== targetShiftId) return false;
              if (targetShiftId === 'NIGHT' && !staff.canNightShift) return false;

              if (
                plan.rules.enableNgPairCheck &&
                staff.ngStaffIds?.some((ngStaffId) =>
                  plan.staffList.some((otherStaff) =>
                    otherStaff.id === ngStaffId &&
                    newAssignments[`${otherStaff.id}_${day.date}`]?.shiftTypeId === targetShiftId
                  )
                )
              ) return false;

              if (!canKeepNightLink(staff, dayIndex, targetShiftId)) return false;
              if (!hasRequiredRest(staff.id, dayIndex, targetShiftId)) return false;

              const sourceHours = getStaffShiftWorkHours(staff, sourceShift);
              const targetHours = getStaffShiftWorkHours(staff, targetShift);
              const hourDifference = targetHours - sourceHours;
              if (
                staff.employmentType === 'PART_TIME' &&
                (staffWeeklyWorkHours[staff.id]?.[day.weekIndex] || 0) + hourDifference >
                  PART_TIME_WEEKLY_HOURS_LIMIT
              ) return false;
              if (staff.employmentType === 'FULL_TIME') {
                const monthlyLimit =
                  plan.targetMonthlyHours && plan.targetMonthlyHours > 0
                    ? plan.targetMonthlyHours
                    : (staff.monthlyMaxHours ?? 168);
                if ((staffWorkHours[staff.id] || 0) + hourDifference > monthlyLimit) return false;
              }
              return true;
            }),
            targetShiftId
          );
          const staff = candidates[0];
          if (staff) {
            reassignment = {
              staff,
              sourceShiftId,
              sourceHours: getStaffShiftWorkHours(staff, sourceShift),
              targetHours: getStaffShiftWorkHours(staff, targetShift),
            };
            break;
          }
        }

        if (!reassignment) break;

        const { staff, sourceShiftId, sourceHours, targetHours } = reassignment;
        const key = `${staff.id}_${day.date}`;
        newAssignments[key] = {
          ...newAssignments[key],
          shiftTypeId: targetShiftId,
        };
        shiftCounts[sourceShiftId] = (shiftCounts[sourceShiftId] || 0) - 1;
        shiftCounts[targetShiftId] = (shiftCounts[targetShiftId] || 0) + 1;
        removeMonthlyShiftCount(staff.id, sourceShiftId);
        addMonthlyShiftCount(staff.id, targetShiftId);
        if (sourceShiftId === 'EARLY' || sourceShiftId === 'DAY' || sourceShiftId === 'LATE') {
          staffDayShiftCounts[staff.id][sourceShiftId] = Math.max(
            0,
            getDayShiftCount(staff.id, sourceShiftId) - 1
          );
        }
        addDayShiftCount(staff.id, targetShiftId);
        const hourDifference = targetHours - sourceHours;
        staffWorkHours[staff.id] += hourDifference;
        staffWeeklyWorkHours[staff.id][day.weekIndex] =
          (staffWeeklyWorkHours[staff.id][day.weekIndex] || 0) + hourDifference;

        if (targetShiftId === 'NIGHT' && nightShiftLinkRule !== 'none') {
          if (dayIndex < days.length - 1) {
            const nextKey = `${staff.id}_${days[dayIndex + 1].date}`;
            if (
              newAssignments[nextKey]?.shiftTypeId === 'HOLIDAY' &&
              !newAssignments[nextKey].isLocked &&
              !newAssignments[nextKey].isRequested
            ) {
              newAssignments[nextKey] = {
                ...newAssignments[nextKey],
                shiftTypeId: 'NIGHT_NEXT',
              };
              staffHolidayCounts[staff.id] = Math.max(
                0,
                (staffHolidayCounts[staff.id] || 0) - 1
              );
            } else if (!newAssignments[nextKey]) {
              newAssignments[nextKey] = {
                staffId: staff.id,
                date: days[dayIndex + 1].date,
                shiftTypeId: 'NIGHT_NEXT',
                isLocked: false,
                isRequested: false,
              };
            }
          }
          if (nightShiftLinkRule === 'night_next_holiday' && dayIndex < days.length - 2) {
            const dayAfterNextKey = `${staff.id}_${days[dayIndex + 2].date}`;
            if (!newAssignments[dayAfterNextKey]) {
              newAssignments[dayAfterNextKey] = {
                staffId: staff.id,
                date: days[dayIndex + 2].date,
                shiftTypeId: 'HOLIDAY',
                isLocked: false,
                isRequested: false,
              };
              staffHolidayCounts[staff.id] = (staffHolidayCounts[staff.id] || 0) + 1;
            }
          }
        }
      }
    });
  });

  // 7. 別日の余剰シフトと公休を入れ替え、同日調整で残った不足を補う
  const crossDateTargetShiftIds: ShiftTypeId[] = [
    'EARLY',
    'LATE',
    'NIGHT',
    ...customWorkShifts.map((shiftType) => shiftType.id),
  ];
  const getDayShiftCounts = (date: string): Partial<Record<ShiftTypeId, number>> => {
    const counts: Partial<Record<ShiftTypeId, number>> = {};
    plan.staffList.forEach((staff) => {
      const shiftId = newAssignments[`${staff.id}_${date}`]?.shiftTypeId;
      if (shiftId) counts[shiftId] = (counts[shiftId] || 0) + 1;
    });
    return counts;
  };
  const getStaffWeekHolidayCount = (staffId: string, weekIndex: number): number =>
    (daysByWeek.get(weekIndex) || []).filter((weekDay) =>
      countsAsHoliday(newAssignments[`${staffId}_${weekDay.date}`]?.shiftTypeId)
    ).length;
  const getConsecutiveWorkDaysAfterSwap = (
    staffId: string,
    dayIndex: number,
    overrides: Record<string, ShiftTypeId>
  ): number => {
    let consecutiveDays = 1;
    for (let index = dayIndex - 1; index >= 0; index--) {
      if (!countsAsWorkDay(getAssignedShiftId(staffId, index, overrides))) break;
      consecutiveDays++;
    }
    for (let index = dayIndex + 1; index < days.length; index++) {
      if (!countsAsWorkDay(getAssignedShiftId(staffId, index, overrides))) break;
      consecutiveDays++;
    }
    return consecutiveDays;
  };
  const canAssignCoverageShift = (
    staff: Staff,
    day: (typeof days)[number],
    shiftId: ShiftTypeId
  ): boolean => {
    if (staff.availableShiftTypes && !staff.availableShiftTypes.includes(shiftId)) return false;
    if (
      staff.employmentType === 'PART_TIME' &&
      staff.fixedShiftType &&
      staff.fixedShiftType !== shiftId
    ) return false;
    const fixedDayShift = staff.fixedDayShifts?.[day.dayOfWeekIndex];
    if (fixedDayShift && fixedDayShift !== shiftId) return false;
    if (shiftId === 'NIGHT' && !staff.canNightShift) return false;
    return true;
  };
  const canApplyCoverageSwap = (
    sourceStaff: Staff,
    sourceDay: (typeof days)[number],
    sourceDayIndex: number,
    sourceShiftId: ShiftTypeId,
    targetStaff: Staff,
    targetDay: (typeof days)[number],
    targetDayIndex: number,
    targetShiftId: ShiftTypeId
  ): boolean => {
    const sourceKey = `${sourceStaff.id}_${sourceDay.date}`;
    const targetKey = `${targetStaff.id}_${targetDay.date}`;
    const sourceAssignment = newAssignments[sourceKey];
    const targetAssignment = newAssignments[targetKey];
    const sourceShift = plan.shiftTypes[sourceShiftId];
    const targetShift = plan.shiftTypes[targetShiftId];
    if (
      !sourceAssignment ||
      sourceAssignment.shiftTypeId !== sourceShiftId ||
      sourceAssignment.isLocked ||
      sourceAssignment.isRequested ||
      !targetAssignment ||
      targetAssignment.shiftTypeId !== 'HOLIDAY' ||
      targetAssignment.isLocked ||
      targetAssignment.isRequested ||
      !sourceShift?.isWork ||
      sourceShift.isNight ||
      !targetShift?.isWork ||
      !canAssignCoverageShift(targetStaff, targetDay, targetShiftId)
    ) return false;

    if (
      plan.rules.enableNgPairCheck &&
      targetStaff.ngStaffIds?.some((ngStaffId) =>
        newAssignments[`${ngStaffId}_${targetDay.date}`]?.shiftTypeId === targetShiftId
      )
    ) return false;

    const overrides: Record<string, ShiftTypeId> = {
      [sourceKey]: 'HOLIDAY',
      [targetKey]: targetShiftId,
    };
    if (
      !canKeepNightLink(sourceStaff, sourceDayIndex, 'HOLIDAY', overrides) ||
      !canKeepNightLink(targetStaff, targetDayIndex, targetShiftId, overrides) ||
      !hasRequiredRest(targetStaff.id, targetDayIndex, targetShiftId, overrides) ||
      getConsecutiveWorkDaysAfterSwap(
        targetStaff.id,
        targetDayIndex,
        overrides
      ) > plan.rules.maxConsecutiveWorkDays
    ) return false;

    type WeeklySwapImpact = { workDays: number; workHours: number; holidays: number };
    type StaffSwapImpact = { monthlyHours: number; weeks: Record<number, WeeklySwapImpact> };
    const impacts: Record<string, StaffSwapImpact> = {};
    const addImpact = (
      staff: Staff,
      day: (typeof days)[number],
      workDays: number,
      workHours: number,
      holidays: number
    ) => {
      if (!impacts[staff.id]) impacts[staff.id] = { monthlyHours: 0, weeks: {} };
      impacts[staff.id].monthlyHours += workHours;
      if (!impacts[staff.id].weeks[day.weekIndex]) {
        impacts[staff.id].weeks[day.weekIndex] = { workDays: 0, workHours: 0, holidays: 0 };
      }
      impacts[staff.id].weeks[day.weekIndex].workDays += workDays;
      impacts[staff.id].weeks[day.weekIndex].workHours += workHours;
      impacts[staff.id].weeks[day.weekIndex].holidays += holidays;
    };
    const sourceHours = getStaffShiftWorkHours(sourceStaff, sourceShift);
    const targetHours = getStaffShiftWorkHours(targetStaff, targetShift);
    addImpact(sourceStaff, sourceDay, -1, -sourceHours, 1);
    addImpact(targetStaff, targetDay, 1, targetHours, -1);

    for (const staffId of Object.keys(impacts)) {
      const staff = plan.staffList.find((candidate) => candidate.id === staffId);
      if (!staff) return false;
      const impact = impacts[staffId];
      const currentMonthlyHours = staffWorkHours[staffId] || 0;
      const nextMonthlyHours = currentMonthlyHours + impact.monthlyHours;

      if (staff.employmentType === 'FULL_TIME') {
        const monthlyTarget =
          plan.targetMonthlyHours && plan.targetMonthlyHours > 0
            ? plan.targetMonthlyHours
            : staff.monthlyMaxHours ?? 168;
        const monthlyLimit = staff.monthlyMaxHours ?? monthlyTarget;
        if (
          nextMonthlyHours > monthlyLimit ||
          Math.abs(nextMonthlyHours - monthlyTarget) >
            Math.abs(currentMonthlyHours - monthlyTarget)
        ) return false;
      }

      for (const [weekIndexText, weeklyImpact] of Object.entries(impact.weeks)) {
        const weekIndex = Number(weekIndexText);
        const currentWorkDays = staffWeeklyWorkDaysCount[staffId]?.[weekIndex] || 0;
        const nextWorkDays = currentWorkDays + weeklyImpact.workDays;
        const currentWeekHours = staffWeeklyWorkHours[staffId]?.[weekIndex] || 0;
        const nextWeekHours = currentWeekHours + weeklyImpact.workHours;
        if (nextWorkDays < 0 || nextWeekHours < 0) return false;

        if (staff.employmentType === 'PART_TIME') {
          const targetDays = partTimeWeeklyTargets[staffId]?.[weekIndex];
          if (
            nextWeekHours > PART_TIME_WEEKLY_HOURS_LIMIT ||
            (targetDays !== undefined &&
              Math.abs(nextWorkDays - targetDays) >
                Math.abs(currentWorkDays - targetDays))
          ) return false;
        } else {
          const weekTarget = fullTimeWeeklyHolidayTargets[weekIndex] || {
            targetHolidays: 2,
            maxWorkDays: 5,
          };
          const currentHolidays = getStaffWeekHolidayCount(staffId, weekIndex);
          const nextHolidays = currentHolidays + weeklyImpact.holidays;
          if (
            nextWorkDays > weekTarget.maxWorkDays ||
            Math.abs(nextHolidays - weekTarget.targetHolidays) >
              Math.abs(currentHolidays - weekTarget.targetHolidays)
          ) return false;
        }
      }
    }
    return true;
  };

  days.forEach((targetDay, targetDayIndex) => {
    crossDateTargetShiftIds.forEach((targetShiftId) => {
      const requiredCount = requiredByShift[targetShiftId] ?? 0;
      while (
        plan.staffList.filter(
          (staff) =>
            newAssignments[`${staff.id}_${targetDay.date}`]?.shiftTypeId === targetShiftId
        ).length < requiredCount
      ) {
        const targetCandidates = orderByMonthlyShiftCount(
          plan.staffList.filter((staff) => {
            const assignment = newAssignments[`${staff.id}_${targetDay.date}`];
            return (
              assignment?.shiftTypeId === 'HOLIDAY' &&
              !assignment.isLocked &&
              !assignment.isRequested &&
              canAssignCoverageShift(staff, targetDay, targetShiftId)
            );
          }),
          targetShiftId
        );
        let swap:
          | {
              sourceStaff: Staff;
              sourceDay: (typeof days)[number];
              sourceShiftId: ShiftTypeId;
              targetStaff: Staff;
            }
          | undefined;

        for (const sourceDay of shuffle(days.filter((day) => day.date !== targetDay.date))) {
          const sourceDayIndex = days.findIndex((day) => day.date === sourceDay.date);
          const sourceCounts = getDayShiftCounts(sourceDay.date);
          const surplusShiftIds = Object.keys(requiredByShift)
            .filter((shiftId) => {
              const shiftType = plan.shiftTypes[shiftId];
              return (
                (sourceCounts[shiftId] || 0) > (requiredByShift[shiftId] ?? 0) &&
                shiftType?.isWork &&
                !shiftType.isNight
              );
            })
            .sort(
              (first, second) =>
                (sourceCounts[second] || 0) - (requiredByShift[second] || 0) -
                ((sourceCounts[first] || 0) - (requiredByShift[first] || 0))
            );

          for (const sourceShiftId of surplusShiftIds) {
            const sourceCandidates = orderByMonthlyShiftCount(
              plan.staffList.filter((staff) => {
                const assignment = newAssignments[`${staff.id}_${sourceDay.date}`];
                return (
                  assignment?.shiftTypeId === sourceShiftId &&
                  !assignment.isLocked &&
                  !assignment.isRequested &&
                  !staff.fixedDayShifts?.[sourceDay.dayOfWeekIndex]
                );
              }),
              sourceShiftId
            );
            for (const sourceStaff of sourceCandidates) {
              for (const targetStaff of targetCandidates) {
                if (
                  canApplyCoverageSwap(
                    sourceStaff,
                    sourceDay,
                    sourceDayIndex,
                    sourceShiftId,
                    targetStaff,
                    targetDay,
                    targetDayIndex,
                    targetShiftId
                  )
                ) {
                  swap = {
                    sourceStaff,
                    sourceDay,
                    sourceShiftId,
                    targetStaff,
                  };
                  break;
                }
              }
              if (swap) break;
            }
            if (swap) break;
          }
          if (swap) break;
        }

        if (!swap) break;

        const {
          sourceStaff,
          sourceDay,
          sourceShiftId,
          targetStaff,
        } = swap;
        const sourceKey = `${sourceStaff.id}_${sourceDay.date}`;
        const targetKey = `${targetStaff.id}_${targetDay.date}`;
        const sourceHours = getStaffShiftWorkHours(sourceStaff, plan.shiftTypes[sourceShiftId]);
        const targetHours = getStaffShiftWorkHours(targetStaff, plan.shiftTypes[targetShiftId]);
        newAssignments[sourceKey] = {
          ...newAssignments[sourceKey],
          shiftTypeId: 'HOLIDAY',
        };
        newAssignments[targetKey] = {
          ...newAssignments[targetKey],
          shiftTypeId: targetShiftId,
        };
        removeMonthlyShiftCount(sourceStaff.id, sourceShiftId);
        addMonthlyShiftCount(sourceStaff.id, 'HOLIDAY');
        removeMonthlyShiftCount(targetStaff.id, 'HOLIDAY');
        addMonthlyShiftCount(targetStaff.id, targetShiftId);
        if (
          sourceShiftId === 'EARLY' ||
          sourceShiftId === 'DAY' ||
          sourceShiftId === 'LATE'
        ) {
          staffDayShiftCounts[sourceStaff.id][sourceShiftId] = Math.max(
            0,
            getDayShiftCount(sourceStaff.id, sourceShiftId) - 1
          );
        }
        addDayShiftCount(targetStaff.id, targetShiftId);
        staffWorkHours[sourceStaff.id] -= sourceHours;
        staffWeeklyWorkHours[sourceStaff.id][sourceDay.weekIndex] =
          (staffWeeklyWorkHours[sourceStaff.id][sourceDay.weekIndex] || 0) - sourceHours;
        staffWeeklyWorkDaysCount[sourceStaff.id][sourceDay.weekIndex] = Math.max(
          0,
          (staffWeeklyWorkDaysCount[sourceStaff.id][sourceDay.weekIndex] || 0) - 1
        );
        staffHolidayCounts[sourceStaff.id] = (staffHolidayCounts[sourceStaff.id] || 0) + 1;
        staffWorkHours[targetStaff.id] += targetHours;
        staffWeeklyWorkHours[targetStaff.id][targetDay.weekIndex] =
          (staffWeeklyWorkHours[targetStaff.id][targetDay.weekIndex] || 0) + targetHours;
        staffWeeklyWorkDaysCount[targetStaff.id][targetDay.weekIndex] =
          (staffWeeklyWorkDaysCount[targetStaff.id][targetDay.weekIndex] || 0) + 1;
        staffHolidayCounts[targetStaff.id] = Math.max(
          0,
          (staffHolidayCounts[targetStaff.id] || 0) - 1
        );
        if (sourceDay.isWeekend) {
          staffWeekendCounts[sourceStaff.id] = Math.max(
            0,
            (staffWeekendCounts[sourceStaff.id] || 0) - 1
          );
        }
        if (targetDay.isWeekend) {
          staffWeekendCounts[targetStaff.id] = (staffWeekendCounts[targetStaff.id] || 0) + 1;
        }

        if (targetShiftId === 'NIGHT' && nightShiftLinkRule !== 'none') {
          if (targetDayIndex < days.length - 1) {
            const nextKey = `${targetStaff.id}_${days[targetDayIndex + 1].date}`;
            if (
              newAssignments[nextKey]?.shiftTypeId === 'HOLIDAY' &&
              !newAssignments[nextKey].isLocked &&
              !newAssignments[nextKey].isRequested
            ) {
              newAssignments[nextKey] = {
                ...newAssignments[nextKey],
                shiftTypeId: 'NIGHT_NEXT',
              };
              staffHolidayCounts[targetStaff.id] = Math.max(
                0,
                (staffHolidayCounts[targetStaff.id] || 0) - 1
              );
            } else if (!newAssignments[nextKey]) {
              newAssignments[nextKey] = {
                staffId: targetStaff.id,
                date: days[targetDayIndex + 1].date,
                shiftTypeId: 'NIGHT_NEXT',
                isLocked: false,
                isRequested: false,
              };
            }
          }
          if (nightShiftLinkRule === 'night_next_holiday' && targetDayIndex < days.length - 2) {
            const dayAfterNextKey = `${targetStaff.id}_${days[targetDayIndex + 2].date}`;
            if (!newAssignments[dayAfterNextKey]) {
              newAssignments[dayAfterNextKey] = {
                staffId: targetStaff.id,
                date: days[targetDayIndex + 2].date,
                shiftTypeId: 'HOLIDAY',
                isLocked: false,
                isRequested: false,
              };
              staffHolidayCounts[targetStaff.id] = (staffHolidayCounts[targetStaff.id] || 0) + 1;
            }
          }
        }

      }
    });
  });

  staffingShortageWarnings.forEach(({ date, shiftId, message }) => {
    const requiredCount = requiredByShift[shiftId] ?? 0;
    const actualCount = plan.staffList.filter(
      (staff) => newAssignments[`${staff.id}_${date}`]?.shiftTypeId === shiftId
    ).length;
    if (actualCount >= requiredCount) {
      const warningIndex = generationWarnings.indexOf(message);
      if (warningIndex >= 0) generationWarnings.splice(warningIndex, 1);
    }
  });

  if (generationWarnings.length > 0) {
    console.warn('[シフト自動作成] 一部の条件を満たせませんでした。', generationWarnings);
  }

  return newAssignments;
}
