import { MonthlySchedulePlan } from '../types/shift';
import { getDaysInMonth } from './dateUtils';

const STORAGE_KEY = 'SHIFT_AUTO_CREATOR_PLAN_V1';

export function savePlanToStorage(plan: MonthlySchedulePlan): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch (error) {
    console.error('Failed to save plan to localStorage:', error);
  }
}

export function loadPlanFromStorage(): MonthlySchedulePlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load plan from localStorage:', error);
    return null;
  }
}

export function exportPlanAsJson(plan: MonthlySchedulePlan): void {
  const jsonStr = JSON.stringify(plan, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift_plan_${plan.yearMonth}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPlanAsCsv(plan: MonthlySchedulePlan): void {
  const days = getDaysInMonth(plan.yearMonth);
  const headers = ['スタッフ名', '職種', '雇用形態', ...days.map((d) => `${d.dayNumber}(${d.dayOfWeek})`), '合計時間(h)'];
  
  const rows = plan.staffList.map((staff) => {
    let totalHours = 0;
    const shiftCells = days.map((day) => {
      const key = `${staff.id}_${day.date}`;
      const assign = plan.assignments[key];
      if (!assign) return '-';
      const shift = plan.shiftTypes[assign.shiftTypeId];
      if (shift?.isWork) totalHours += shift.workHours;
      return shift ? shift.shortName : '-';
    });

    return [
      staff.name,
      staff.role,
      staff.employmentType,
      ...shiftCells,
      totalHours.toString(),
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\r\n');
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel in Japanese
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift_table_${plan.yearMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
