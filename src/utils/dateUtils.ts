export interface CalendarDay {
  date: string;       // YYYY-MM-DD
  dayNumber: number;  // 1〜31
  dayOfWeek: string;  // '日', '月', '火', ...
  dayOfWeekIndex: number; // 0(日)〜6(土)
  isWeekend: boolean; // 土日フラグ
  isSunday: boolean;
  isSaturday: boolean;
  weekIndex: number;  // 週番号（月曜起算）
}

export function getDaysInMonth(yearMonth: string): CalendarDay[] {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12

  const daysCount = new Date(year, month, 0).getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  const days: CalendarDay[] = [];
  let currentWeek = 0;

  for (let d = 1; d <= daysCount; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeekIndex = dateObj.getDay();
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    // 月曜日に新しい週へ切り替え（1日目を除く）
    if (d > 1 && dayOfWeekIndex === 1) {
      currentWeek++;
    }

    days.push({
      date: formattedDate,
      dayNumber: d,
      dayOfWeek: dayNames[dayOfWeekIndex],
      dayOfWeekIndex,
      isWeekend: dayOfWeekIndex === 0 || dayOfWeekIndex === 6,
      isSunday: dayOfWeekIndex === 0,
      isSaturday: dayOfWeekIndex === 6,
      weekIndex: currentWeek,
    });
  }

  return days;
}
