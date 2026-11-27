import { MonthlySchedulePlan } from '../types/shift';
import { getDaysInMonth } from './dateUtils';
import { getStaffDisplayOrder } from './staffOrder';

const STORAGE_KEY = 'SHIFT_AUTO_CREATOR_PLAN_V1';
const PLANS_STORAGE_KEY = 'SHIFT_AUTO_CREATOR_PLANS_V1';

type SaveFilePickerOptions = {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
};

type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
};

let jsonSaveFileHandle: FileSystemFileHandle | null = null;

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

export function savePlansToStorage(plans: Record<string, MonthlySchedulePlan>): void {
  try {
    localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(plans));
  } catch (error) {
    console.error('Failed to save plans to localStorage:', error);
  }
}

export function loadPlansFromStorage(): Record<string, MonthlySchedulePlan> {
  try {
    const rawPlans = localStorage.getItem(PLANS_STORAGE_KEY);
    if (rawPlans) {
      const plans = JSON.parse(rawPlans) as Record<string, MonthlySchedulePlan>;
      if (plans && typeof plans === 'object' && !Array.isArray(plans)) return plans;
    }

    const savedPlan = loadPlanFromStorage();
    return savedPlan ? { [savedPlan.yearMonth]: savedPlan } : {};
  } catch (error) {
    console.error('Failed to load plans from localStorage:', error);
    return {};
  }
}

function downloadPlanAsJson(plan: MonthlySchedulePlan, jsonStr: string): void {
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift_plan_${plan.yearMonth}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

export async function exportPlanAsJson(
  plan: MonthlySchedulePlan,
  chooseNewLocation = false
): Promise<void> {
  const jsonStr = JSON.stringify(plan, null, 2);
  const picker = (window as WindowWithSaveFilePicker).showSaveFilePicker;

  if (typeof picker !== 'function') {
    downloadPlanAsJson(plan, jsonStr);
    return;
  }

  try {
    if (chooseNewLocation || !jsonSaveFileHandle) {
      jsonSaveFileHandle = await picker.call(window, {
        suggestedName: `shift_plan_${plan.yearMonth}.json`,
        types: [
          {
            description: 'JSON files',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
    }

    const writable = await jsonSaveFileHandle.createWritable();
    await writable.write(jsonStr);
    await writable.close();
  } catch (error) {
    if (isAbortError(error)) return;
    console.error('JSONファイルの保存に失敗しました:', error);
    alert('JSONファイルを保存できませんでした。保存先へのアクセス権限をご確認ください。');
  }
}

export function exportPlanAsCsv(plan: MonthlySchedulePlan): void {
  const days = getDaysInMonth(plan.yearMonth);
  const headers = ['スタッフ名', '職種', '雇用形態', ...days.map((d) => `${d.dayNumber}(${d.dayOfWeek})`), '合計時間(h)'];
  
  const rows = getStaffDisplayOrder(plan.staffList).map((staff) => {
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
