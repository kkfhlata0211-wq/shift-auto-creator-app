import { MonthlySchedulePlan, ShiftType, Staff } from '../types/shift';
import { getDaysInMonth, getPreviousYearMonth } from '../utils/dateUtils';

export const DEFAULT_PART_TIME_DAILY_WORK_HOURS = 8;
export const PART_TIME_WEEKLY_HOURS_LIMIT = 40;

export interface PartTimeWorkStats {
  hasData: boolean;
  workDays: number;
  workHours: number;
}

export interface PartTimeWeekTargetRange {
  min: number;
  max: number;
}

export function getPartTimeDailyWorkHours(staff: Staff): number {
  return staff.dailyWorkHours ?? DEFAULT_PART_TIME_DAILY_WORK_HOURS;
}

export function getStaffShiftWorkHours(staff: Staff, shift: ShiftType | undefined): number {
  if (!shift?.isWork) return 0;
  return staff.employmentType === 'PART_TIME'
    ? getPartTimeDailyWorkHours(staff)
    : shift.workHours;
}

export function getPartTimeWeeklyWorkDaysTarget(staff: Staff): number | undefined {
  if (staff.allowedWeeklyWorkDays && staff.allowedWeeklyWorkDays.length > 0) {
    // 複数選択されている場合は多い方を基準にする
    return Math.max(...staff.allowedWeeklyWorkDays);
  }
  // 未設定の場合: 1日の契約時間と月間契約時間から逆算した週日数をフォールバックとする
  if (staff.employmentType === 'PART_TIME') {
    const dailyHours = getPartTimeDailyWorkHours(staff);
    const estimatedDaysPerMonth = Math.round((staff.monthlyMaxHours || 80) / dailyHours);
    return Math.min(5, Math.max(1, Math.round(estimatedDaysPerMonth / 4.3)));
  }
  return undefined;
}

export function getPartTimeWeekTargetRange(
  targetDays: number,
  monthDaysInWeek: number,
  isMonthEndWeek: boolean
): PartTimeWeekTargetRange {
  const target = Math.max(0, Math.floor(targetDays));
  const availableDays = Math.max(0, monthDaysInWeek);

  if (availableDays >= 7) {
    return { min: target, max: target };
  }

  // 月頭・月末の端数週: 日数比率に応じた目標日数（例: 3日週なら target * 3 / 7）
  if (isMonthEndWeek && availableDays <= 2) {
    return {
      min: 0,
      max: Math.min(availableDays, target <= 2 ? 0 : 1),
    };
  }

  const prorated = Math.round(target * (availableDays / 7));
  const count = Math.min(availableDays, Math.max(prorated, 1));
  return { min: count, max: count };
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function getPreviousMonthWorkStats(
  yearMonth: string,
  staffList: Staff[],
  previousMonthPlan?: MonthlySchedulePlan
): Record<string, PartTimeWorkStats> {
  const stats: Record<string, PartTimeWorkStats> = {};
  staffList.forEach((staff) => {
    stats[staff.id] = { hasData: false, workDays: 0, workHours: 0 };
  });

  if (
    !previousMonthPlan ||
    previousMonthPlan.yearMonth !== getPreviousYearMonth(yearMonth)
  ) {
    return stats;
  }

  const currentDays = getDaysInMonth(yearMonth);
  const firstDate = currentDays[0]?.date;
  if (!firstDate) return stats;

  const [year, month, day] = firstDate.split('-').map(Number);
  const weekStart = new Date(year, month - 1, day);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekStartDate = formatDate(weekStart);
  const previousMonthDays = getDaysInMonth(previousMonthPlan.yearMonth).filter(
    (previousDay) => previousDay.date >= weekStartDate && previousDay.date < firstDate
  );
  const previousStaff = new Map(previousMonthPlan.staffList.map((staff) => [staff.id, staff]));

  previousMonthDays.forEach((previousDay) => {
    staffList.forEach((staff) => {
      const assignment = previousMonthPlan.assignments[`${staff.id}_${previousDay.date}`];
      if (!assignment) return;
      stats[staff.id].hasData = true;

      const shift = previousMonthPlan.shiftTypes[assignment.shiftTypeId];
      if (!shift?.isWork) return;

      stats[staff.id].workDays++;
      stats[staff.id].workHours += getStaffShiftWorkHours(
        previousStaff.get(staff.id) || staff,
        shift
      );
    });
  });

  return stats;
}
