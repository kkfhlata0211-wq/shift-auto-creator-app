export interface CalendarDay {
  date: string;       // YYYY-MM-DD
  dayNumber: number;  // 1〜31
  dayOfWeek: string;  // '日', '月', '火', ...
  isWeekend: boolean; // 土日フラグ
  isSunday: boolean;
  isSaturday: boolean;
}

export function getDaysInMonth(yearMonth: string): CalendarDay[] {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12

  const daysCount = new Date(year, month, 0).getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  const days: CalendarDay[] = [];
  for (let d = 1; d <= daysCount; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeekIndex = dateObj.getDay();
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    days.push({
      date: formattedDate,
      dayNumber: d,
      dayOfWeek: dayNames[dayOfWeekIndex],
      isWeekend: dayOfWeekIndex === 0 || dayOfWeekIndex === 6,
      isSunday: dayOfWeekIndex === 0,
      isSaturday: dayOfWeekIndex === 6,
    });
  }

  return days;
}
