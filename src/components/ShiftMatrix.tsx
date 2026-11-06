import React, { useState } from 'react';
import { Lock, Moon, Star, Calendar, Plus, Trash2, Check, X } from 'lucide-react';
import { MonthlySchedulePlan, ShiftTypeId, DayEvent } from '../types/shift';
import { getDaysInMonth, CalendarDay } from '../utils/dateUtils';
import { ValidationSummary } from '../engine/validator';

interface ShiftMatrixProps {
  plan: MonthlySchedulePlan;
  validation: ValidationSummary;
  onUpdateAssignment: (staffId: string, date: string, shiftTypeId: ShiftTypeId, isLocked?: boolean) => void;
  onToggleLock: (staffId: string, date: string) => void;
  onUpdateEvent?: (date: string, event: DayEvent | null) => void;
}

export const ShiftMatrix: React.FC<ShiftMatrixProps> = ({
  plan,
  validation,
  onUpdateAssignment,
  onToggleLock,
  onUpdateEvent,
}) => {
  const days: CalendarDay[] = getDaysInMonth(plan.yearMonth);
  const sortedStaffList = [...plan.staffList].sort(
    (first, second) => Number(first.employmentType === 'PART_TIME') - Number(second.employmentType === 'PART_TIME')
  );
  const getDayColumnStyle = (day: CalendarDay): React.CSSProperties => ({
    width: 42,
    ...(day.dayNumber % 7 === 0 ? { borderRight: '3px double #94a3b8' } : {}),
  });
  const summaryShiftIds: ShiftTypeId[] = [
    'EARLY',
    'DAY',
    'LATE',
    'NIGHT',
    'NIGHT_NEXT',
    'HOLIDAY',
    'PAID_LEAVE',
  ];

  // ポップオーバーで選択中のセル
  const [activeCell, setActiveCell] = useState<{
    staffId: string;
    date: string;
  } | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<ShiftTypeId>('DAY');
  const [selectedIsLocked, setSelectedIsLocked] = useState<boolean>(false);

  const handleOpenCellEditor = (staffId: string, date: string) => {
    const existing = plan.assignments[`${staffId}_${date}`];
    setSelectedShiftId(existing?.shiftTypeId || 'DAY');
    setSelectedIsLocked(existing?.isLocked || false);
    setActiveCell({ staffId, date });
  };

  // 行事・イベント編集中の日付
  const [editingEventDate, setEditingEventDate] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<{ title: string; notes: string; color: string }>({
    title: '',
    notes: '',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  });

  const handleOpenEventEditor = (date: string) => {
    const existing = plan.events[date];
    if (existing) {
      setEventForm({
        title: existing.title,
        notes: existing.notes || '',
        color: existing.color || 'bg-indigo-100 text-indigo-800 border-indigo-200',
      });
    } else {
      setEventForm({
        title: '',
        notes: '',
        color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      });
    }
    setEditingEventDate(date);
  };

  const handleSaveEvent = () => {
    if (!editingEventDate) return;
    if (!eventForm.title.trim()) {
      // タイトル空欄の場合はイベント削除
      if (onUpdateEvent) onUpdateEvent(editingEventDate, null);
    } else {
      if (onUpdateEvent) {
        onUpdateEvent(editingEventDate, {
          date: editingEventDate,
          title: eventForm.title.trim(),
          notes: eventForm.notes.trim() || undefined,
          color: eventForm.color,
        });
      }
    }
    setEditingEventDate(null);
  };

  const handleDeleteEvent = () => {
    if (!editingEventDate) return;
    if (onUpdateEvent) {
      onUpdateEvent(editingEventDate, null);
    }
    setEditingEventDate(null);
  };

  const getShiftBadge = (shiftId?: ShiftTypeId, isLocked: boolean = false) => {
    if (!shiftId) {
      return (
        <span className="inline-block w-7 h-7 leading-7 text-center rounded text-xs text-slate-300 border border-dashed border-slate-200">
          -
        </span>
      );
    }
    const def = plan.shiftTypes[shiftId];
    if (!def) return <span>{shiftId}</span>;

    return (
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold border transition-transform hover:scale-105 shadow-xs ${def.color} ${
          isLocked ? 'ring-2 ring-amber-400 ring-offset-1 font-extrabold' : ''
        }`}
        title={`${def.name} (${def.startTime}〜${def.endTime}, 実働${def.workHours}h)${
          isLocked ? ' 【変更固定中】' : ''
        }`}
      >
        {def.shortName}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative">
      {/* 凡例バー */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-700">勤務区分 凡例:</span>
          {Object.values(plan.shiftTypes).map((st) => (
            <div key={st.id} className="flex items-center gap-1">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold border ${st.color}`}>
                {st.shortName}
              </span>
              <span>{st.name}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 text-slate-600">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="inline-flex items-center justify-center bg-amber-500 text-white rounded-full p-0.5 shadow-xs">
              <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
            </span>
            変更を固定中
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> ルール違反
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-rose-100 border border-rose-300 inline-block" /> 人員不足
          </span>
        </div>
      </div>

      {/* スクロール可能なマトリクスグリッド */}
      <div className="flex-1 overflow-auto p-4">
        <div className="inline-block min-w-full align-middle bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="border-separate border-spacing-0 text-left text-xs table-fixed [&_th]:border-gray-300 [&_td]:border-gray-300">
            {/* カラム幅をブラウザの拡大縮小時もピクセル単位で厳格固定 */}
            <colgroup>
              <col style={{ width: 150, minWidth: 150, maxWidth: 150 }} />
              <col style={{ width: 110, minWidth: 110, maxWidth: 110 }} />
              <col style={{ width: 95, minWidth: 95, maxWidth: 95 }} />
              <col style={{ width: 95, minWidth: 95, maxWidth: 95 }} />
              {days.map((day) => (
                <col key={day.date} style={{ width: 42, minWidth: 42, maxWidth: 42 }} />
              ))}
              {summaryShiftIds.map((shiftId) => (
                <col key={shiftId} style={{ width: 36, minWidth: 36, maxWidth: 36 }} />
              ))}
            </colgroup>

            <thead>
              {/* 1段目: 日付・曜日行 */}
              <tr className="bg-slate-100">
                <th
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-30 bg-slate-100 px-3 py-2 font-bold text-slate-700 border-b border-r border-slate-200"
                >
                  スタッフ氏名
                </th>
                <th
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-30 bg-slate-100 px-2 py-2 font-bold text-slate-700 border-b border-r border-slate-200 text-center"
                >
                  職種 / スキル
                </th>
                <th
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-30 bg-slate-100 px-2 py-2 font-bold text-slate-700 border-b border-r border-slate-200 text-center"
                >
                  週契約時間
                </th>
                <th
                  style={{ left: 355, width: 95 }}
                  className="sticky left-[355px] z-30 bg-slate-100 px-2 py-2 font-bold text-slate-700 border-b border-r border-slate-200 text-center"
                >
                  月労働時間
                </th>
                {days.map((day) => {
                  const isSun = day.isSunday;
                  const isSat = day.isSaturday;
                  const dayColor = isSun
                    ? 'text-rose-600 bg-rose-50'
                    : isSat
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-700 bg-slate-100';

                  return (
                    <th
                      key={day.date}
                      style={getDayColumnStyle(day)}
                      className={`px-1 py-1.5 text-center border-b border-r border-slate-200 ${dayColor}`}
                    >
                      <div className="font-bold text-sm leading-none">{day.dayNumber}</div>
                      <div className="text-[10px] font-semibold mt-0.5">({day.dayOfWeek})</div>
                    </th>
                  );
                })}
                {summaryShiftIds.map((shiftId) => (
                  <th
                    key={`summary_${shiftId}`}
                    className="px-1 py-1.5 text-center font-bold border-b border-r border-slate-300 bg-slate-200 text-slate-700"
                    title={`${plan.shiftTypes[shiftId].name}の月間合計`}
                  >
                    {plan.shiftTypes[shiftId].shortName}
                  </th>
                ))}
              </tr>

              {/* 2段目: 行事・イベント行（日付の下に配置＆編集可能） */}
              <tr className="bg-slate-50">
                <th
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-30 bg-slate-50 px-3 py-1 font-bold text-slate-600 border-b border-r border-slate-200"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>行事・イベント</span>
                    <span className="text-[10px] text-slate-400 font-normal">クリック編集</span>
                  </div>
                </th>
                <th
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-30 bg-slate-50 border-b border-r border-slate-200"
                />
                <th
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-30 bg-slate-50 border-b border-r border-slate-200 text-center text-[10px] text-slate-400 font-normal"
                />
                <th
                  style={{ left: 355, width: 95 }}
                  className="sticky left-[355px] z-30 bg-slate-50 border-b border-r border-slate-200"
                />
                {days.map((day) => {
                  const event = plan.events[day.date];
                  return (
                    <th
                      key={`event_${day.date}`}
                      style={getDayColumnStyle(day)}
                      onClick={() => handleOpenEventEditor(day.date)}
                      className="px-0.5 py-1 text-center font-normal border-b border-r border-slate-200 hover:bg-blue-50 cursor-pointer transition-colors group select-none relative"
                      title={
                        event
                          ? `${event.title}${event.notes ? ` (${event.notes})` : ''}\nクリックして編集`
                          : `${day.dayNumber}日の行事・メモを追加`
                      }
                    >
                      {event ? (
                        <div
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate font-bold shadow-xs border ${
                            event.color || 'bg-blue-100 text-blue-800 border-blue-200'
                          }`}
                        >
                          {event.title.slice(0, 3)}
                        </div>
                      ) : (
                        <div className="h-5 flex items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                      )}
                    </th>
                  );
                })}
                {summaryShiftIds.map((shiftId) => (
                  <th key={`event_summary_${shiftId}`} className="border-b border-r border-slate-200 bg-slate-50" />
                ))}
              </tr>
            </thead>

            {/* スタッフ行 */}
            <tbody>
              {sortedStaffList.map((staff) => {
                const isFirstPartTime =
                  staff.employmentType === 'PART_TIME' &&
                  sortedStaffList.find((item) => item.employmentType === 'PART_TIME')?.id === staff.id;
                const hoursInfo = validation.staffHoursSummary[staff.id] || {
                  totalHours: 0,
                  maxHours: staff.monthlyMaxHours,
                  isOver: false,
                  maxWeekHours: 0,
                  isWeeklyOver: false,
                  contractHoursMismatch: false,
                };

                return (
                  <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                    {/* スタッフ名 */}
                    <td
                      style={{ left: 0, width: 150 }}
                      className={`sticky left-0 z-20 bg-white hover:bg-slate-50 px-3 py-2 border-b border-r border-slate-200 ${
                        isFirstPartTime ? 'border-t-[3px] border-double border-slate-400' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            {staff.name}
                            {staff.canNightShift && (
                              <span title="夜勤可能スタッフ">
                                <Moon className="w-3 h-3 text-purple-600" />
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            <span>{staff.employmentType === 'FULL_TIME' ? '正社員' : 'パート'}</span>
                            {staff.fixedShiftType && (
                              <span
                                className={`text-[9px] px-1 py-0.2 rounded font-bold border ${
                                  staff.fixedShiftType === 'EARLY'
                                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                                    : staff.fixedShiftType === 'DAY'
                                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                                    : 'bg-orange-100 text-orange-800 border-orange-300'
                                }`}
                              >
                                {staff.fixedShiftType === 'EARLY'
                                  ? '早固定'
                                  : staff.fixedShiftType === 'DAY'
                                  ? '日固定'
                                  : '遅固定'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 役職・スキル */}
                    <td
                      style={{ left: 150, width: 110 }}
                      className={`sticky left-[150px] z-20 bg-white hover:bg-slate-50 px-2 py-2 border-b border-r border-slate-200 text-center ${
                        isFirstPartTime ? 'border-t-[3px] border-double border-slate-400' : ''
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-700">{staff.role}</div>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5" title={`スキル評価: ${staff.skillLevel}/5`}>
                        {Array.from({ length: staff.skillLevel }).map((_, i) => (
                          <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </td>

                    {/* 週労働時間（契約時間のみ記載、カウントした時間は記載しない） */}
                    <td
                      style={{ left: 260, width: 95 }}
                      className={`sticky left-[260px] z-20 bg-white hover:bg-slate-50 px-2 py-2 border-b border-r border-slate-200 text-center ${
                        hoursInfo.isWeeklyOver ? 'bg-rose-50/70' : ''
                      } ${isFirstPartTime ? 'border-t-[3px] border-double border-slate-400' : ''}`}
                    >
                      {staff.employmentType === 'PART_TIME' ? (
                        <div
                          className={`text-xs font-bold ${
                            hoursInfo.isWeeklyOver ? 'text-rose-600 font-black' : 'text-slate-700'
                          }`}
                          title={`週契約時間: ${staff.weeklyMaxHours || 40}h${
                            hoursInfo.isWeeklyOver ? ` (注意: 週上限${staff.weeklyMaxHours || 40}hを超過している週があります)` : ''
                          }`}
                        >
                          <span>週契約時間</span>
                          <span>{staff.weeklyMaxHours || 40}h</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    {/* 月労働時間 */}
                    <td
                      style={{ left: 355, width: 95 }}
                      className={`sticky left-[355px] z-20 bg-white hover:bg-slate-50 px-2 py-2 border-b border-r border-slate-200 text-center ${
                        staff.employmentType === 'PART_TIME'
                          ? ''
                          : hoursInfo.targetHoursMismatch || hoursInfo.isOver
                          ? 'bg-amber-50/70'
                          : ''
                      } ${isFirstPartTime ? 'border-t-[3px] border-double border-slate-400' : ''}`}
                    >
                      {staff.employmentType === 'PART_TIME' ? (
                        <div
                          className="text-xs font-bold text-slate-800"
                          title="パートの月間合計労働時間"
                        >
                          <span>{hoursInfo.totalHours}h</span>
                        </div>
                      ) : (
                        <div
                          className={`text-xs font-bold ${
                            hoursInfo.targetHoursMismatch
                              ? 'text-amber-600'
                              : hoursInfo.isOver
                              ? 'text-rose-600'
                              : 'text-slate-800'
                          }`}
                          title={
                            plan.targetMonthlyHours
                              ? `所定労働時間: ${plan.targetMonthlyHours}h ${
                                  hoursInfo.targetHoursDiff !== undefined && hoursInfo.targetHoursDiff !== 0
                                    ? `(差分: ${hoursInfo.targetHoursDiff > 0 ? '+' : ''}${hoursInfo.targetHoursDiff}h)`
                                    : '（所定時間と合致OK）'
                                }`
                              : undefined
                          }
                        >
                          <span>{hoursInfo.totalHours}h</span>
                          {plan.targetMonthlyHours &&
                            hoursInfo.targetHoursDiff !== undefined &&
                            hoursInfo.targetHoursDiff !== 0 && (
                              <span className="text-[10px] ml-1 font-semibold text-amber-600 block">
                                {hoursInfo.targetHoursDiff > 0
                                  ? `+${hoursInfo.targetHoursDiff}h`
                                  : `${hoursInfo.targetHoursDiff}h`}
                              </span>
                            )}
                        </div>
                      )}
                    </td>

                    {/* 日付セル */}
                    {days.map((day) => {
                      const key = `${staff.id}_${day.date}`;
                      const assign = plan.assignments[key];
                      const shiftId = assign?.shiftTypeId;
                      const isLocked = assign?.isLocked || false;
                      const cellViolations = validation.violationsByStaffAndDate[key] || [];
                      const hasViolation = cellViolations.length > 0;

                      return (
                        <td
                          key={day.date}
                          style={getDayColumnStyle(day)}
                          onClick={() => handleOpenCellEditor(staff.id, day.date)}
                          className={`relative p-1 text-center border-b border-r border-slate-200 cursor-pointer select-none group ${
                            isLocked ? 'bg-amber-50/50' : ''
                          } ${
                            hasViolation ? 'bg-rose-50 ring-1 ring-inset ring-rose-300' : ''
                          } ${isFirstPartTime ? 'border-t-[3px] border-double border-slate-400' : ''}`}
                        >
                          <div className="flex items-center justify-center relative">
                            {getShiftBadge(shiftId, isLocked)}

                            {/* ロックアイコン（大きく見やすいバッジ・クリックで解除可能） */}
                            {isLocked && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleLock(staff.id, day.date);
                                }}
                                className="absolute -top-1.5 -right-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-full p-0.5 shadow-md ring-1.5 ring-white z-10 flex items-center justify-center transition-colors"
                                title="変更を固定中（クリックで固定解除）"
                              >
                                <Lock className="w-3 h-3 stroke-[2.5]" />
                              </button>
                            )}

                            {/* 違反インジケーター */}
                            {hasViolation && (
                              <span
                                className="w-2 h-2 bg-rose-500 rounded-full absolute -top-1 -left-1 ring-2 ring-white z-10"
                                title={cellViolations.map((v) => v.message).join('\n')}
                              />
                            )}

                          </div>
                        </td>
                      );
                    })}
                    {summaryShiftIds.map((shiftId) => {
                      const count = days.reduce((total, day) => {
                        const assignment = plan.assignments[`${staff.id}_${day.date}`];
                        return total + Number(assignment?.shiftTypeId === shiftId);
                      }, 0);
                      return (
                        <td
                          key={`summary_${staff.id}_${shiftId}`}
                          className={`text-center font-bold text-xs border-b border-r border-slate-200 bg-slate-50 text-slate-700 ${
                            isFirstPartTime ? 'border-t-[3px] border-double border-slate-400' : ''
                          }`}
                          title={`${plan.shiftTypes[shiftId].name}: ${count}回`}
                        >
                          {count}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* 必要人員・集計フッター（時間帯・シフト別） */}
            <tfoot className="border-t-2 border-slate-300 font-medium">
              {/* 早番充足数 */}
              <tr className="bg-amber-50/50">
                <td
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-20 bg-amber-50/90 px-3 py-1 font-bold text-slate-700 border-b border-r border-slate-200"
                >
                  早番 人数 (必要: {plan.rules.defaultRequirements?.EARLY ?? 1})
                </td>
                <td
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-20 bg-amber-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-20 bg-amber-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 355, width: 95 }}
                  className="sticky left-[355px] z-20 bg-amber-50/90 border-b border-r border-slate-200"
                />
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualEarly || 0) < (plan.rules.defaultRequirements?.EARLY ?? 1);
                  return (
                    <td
                      key={`early_${day.date}`}
                      style={getDayColumnStyle(day)}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualEarly || 0}
                    </td>
                  );
                })}
                {summaryShiftIds.map((shiftId) => (
                  <td key={`early_summary_${shiftId}`} className="border-b border-r border-slate-200 bg-amber-50/50" />
                ))}
              </tr>

              {/* 日勤充足数 */}
              <tr className="bg-blue-50/50">
                <td
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-20 bg-blue-50/90 px-3 py-1 font-bold text-slate-700 border-b border-r border-slate-200"
                >
                  日勤 人数 (必要: {plan.rules.defaultRequirements?.DAY ?? 2})
                </td>
                <td
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-20 bg-blue-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-20 bg-blue-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 355, width: 95 }}
                  className="sticky left-[355px] z-20 bg-blue-50/90 border-b border-r border-slate-200"
                />
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualDay || 0) < (plan.rules.defaultRequirements?.DAY ?? 2);
                  return (
                    <td
                      key={`day_${day.date}`}
                      style={getDayColumnStyle(day)}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualDay || 0}
                    </td>
                  );
                })}
                {summaryShiftIds.map((shiftId) => (
                  <td key={`day_summary_${shiftId}`} className="border-b border-r border-slate-200 bg-blue-50/50" />
                ))}
              </tr>

              {/* 遅番充足数 */}
              <tr className="bg-orange-50/50">
                <td
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-20 bg-orange-50/90 px-3 py-1 font-bold text-slate-700 border-b border-r border-slate-200"
                >
                  遅番 人数 (必要: {plan.rules.defaultRequirements?.LATE ?? 1})
                </td>
                <td
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-20 bg-orange-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-20 bg-orange-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 355, width: 95 }}
                  className="sticky left-[355px] z-20 bg-orange-50/90 border-b border-r border-slate-200"
                />
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualLate || 0) < (plan.rules.defaultRequirements?.LATE ?? 1);
                  return (
                    <td
                      key={`late_${day.date}`}
                      style={getDayColumnStyle(day)}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualLate || 0}
                    </td>
                  );
                })}
                {summaryShiftIds.map((shiftId) => (
                  <td key={`late_summary_${shiftId}`} className="border-b border-r border-slate-200 bg-orange-50/50" />
                ))}
              </tr>

              {/* 夜勤充足数 */}
              <tr className="bg-purple-50/50">
                <td
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-20 bg-purple-50/90 px-3 py-1 font-bold text-slate-700 border-b border-r border-slate-200"
                >
                  夜勤 人数 (必要: {plan.rules.defaultRequirements?.NIGHT ?? 1})
                </td>
                <td
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-20 bg-purple-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-20 bg-purple-50/90 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 355, width: 95 }}
                  className="sticky left-[355px] z-20 bg-purple-50/90 border-b border-r border-slate-200"
                />
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualNight || 0) < (plan.rules.defaultRequirements?.NIGHT ?? 1);
                  return (
                    <td
                      key={`night_${day.date}`}
                      style={getDayColumnStyle(day)}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualNight || 0}
                    </td>
                  );
                })}
                {summaryShiftIds.map((shiftId) => (
                  <td key={`night_summary_${shiftId}`} className="border-b border-r border-slate-200 bg-purple-50/50" />
                ))}
              </tr>

              {/* 総合充足判定ハイライト */}
              <tr className="bg-slate-100">
                <td
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-20 bg-slate-100 px-3 py-1.5 font-bold text-slate-800 border-b border-r border-slate-200"
                >
                  人員充足判定 (FTE基準)
                </td>
                <td
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-20 bg-slate-100 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-20 bg-slate-100 border-b border-r border-slate-200"
                />
                <td
                  style={{ left: 355, width: 95 }}
                  className="sticky left-[355px] z-20 bg-slate-100 border-b border-r border-slate-200"
                />
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = cov?.isDeficit;
                  return (
                    <td
                      key={`status_${day.date}`}
                      style={getDayColumnStyle(day)}
                      className={`text-center text-[10px] font-bold py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {isDeficit ? '不足' : '充足'}
                    </td>
                  );
                })}
                {summaryShiftIds.map((shiftId) => (
                  <td key={`status_summary_${shiftId}`} className="border-b border-r border-slate-200 bg-slate-100" />
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* セル編集用ポップオーバー（各シフトの固有カラー常時表示・決定ボタン付き） */}
      {activeCell && (() => {
        const activeStaff = plan.staffList.find((s) => s.id === activeCell.staffId);
        const dayInfo = days.find((d) => d.date === activeCell.date);
        const isSun = dayInfo?.isSunday;
        const isSat = dayInfo?.isSaturday;
        const dateColorClass = isSun ? 'text-rose-600' : isSat ? 'text-blue-600' : 'text-slate-800';

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs"
            onClick={() => setActiveCell(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 w-84 space-y-3.5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ヘッダー */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 bg-slate-50/80 -mx-5 -mt-5 px-5 pt-4 rounded-t-2xl">
                <div>
                  <div className="text-xs text-blue-700 font-bold flex items-center gap-1.5">
                    <span>{activeStaff?.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold">
                      {activeStaff?.employmentType === 'FULL_TIME' ? '正社員' : 'パート'}
                    </span>
                  </div>
                  <div className={`font-extrabold text-sm ${dateColorClass} flex items-center gap-1 mt-0.5`}>
                    <Calendar className="w-4 h-4" />
                    <span>{activeCell.date} ({dayInfo?.dayOfWeek}) 勤務変更</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCell(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* シフト選択ボタン群（各シフトの固有カラーを常時反映） */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  勤務区分を選択
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(plan.shiftTypes).map((st) => {
                    const isSelected = selectedShiftId === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedShiftId(st.id)}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs font-bold transition-all shadow-xs ${
                          st.color
                        } ${
                          isSelected
                            ? 'ring-2 ring-slate-800 ring-offset-1 shadow-md scale-[1.03] font-black'
                            : 'opacity-85 hover:opacity-100 hover:shadow hover:scale-[1.01]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/90 text-slate-800 font-black text-xs shadow-xs">
                            {st.shortName}
                          </span>
                          <span className="text-xs">{st.name}</span>
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 固定オプション（勝手に固定されない・任意選択） */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none py-1 px-1 rounded-lg hover:bg-amber-50/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedIsLocked}
                    onChange={(e) => setSelectedIsLocked(e.target.checked)}
                    className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-400 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 font-bold">
                    <Lock
                      className={`w-3.5 h-3.5 ${
                        selectedIsLocked ? 'text-amber-500 stroke-[2.5]' : 'text-slate-400'
                      }`}
                    />
                    <span>このセルを固定する（自動作成時も維持）</span>
                  </div>
                </label>
              </div>

              {/* アクションボタン群（【決定】ボタン） */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveCell(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-semibold"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateAssignment(
                      activeCell.staffId,
                      activeCell.date,
                      selectedShiftId,
                      selectedIsLocked
                    );
                    setActiveCell(null);
                  }}
                  className="flex items-center gap-1.5 px-5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black rounded-lg shadow-md transition-all"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>決定</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 行事・イベント編集ポップオーバー */}
      {editingEventDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4"
          onClick={() => setEditingEventDate(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 p-5 w-80 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>{editingEventDate} の行事・イベント</span>
              </div>
              <button
                onClick={() => setEditingEventDate(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  行事・イベント名
                </label>
                <input
                  type="text"
                  placeholder="例: 定期健康診断, 入浴日, 研修"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  備考・時間帯（任意）
                </label>
                <input
                  type="text"
                  placeholder="例: 13:00〜, 午前中検診車"
                  value={eventForm.notes}
                  onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ラベル色</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '青', value: 'bg-blue-100 text-blue-800 border-blue-200' },
                    { label: '緑', value: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
                    { label: '橙', value: 'bg-amber-100 text-amber-800 border-amber-200' },
                    { label: '紫', value: 'bg-purple-100 text-purple-800 border-purple-200' },
                  ].map((colorOpt) => (
                    <button
                      key={colorOpt.value}
                      type="button"
                      onClick={() => setEventForm({ ...eventForm, color: colorOpt.value })}
                      className={`py-1 rounded text-center font-bold border transition-transform ${
                        colorOpt.value
                      } ${eventForm.color === colorOpt.value ? 'ring-2 ring-blue-500 scale-105' : ''}`}
                    >
                      {colorOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              {plan.events[editingEventDate] ? (
                <button
                  type="button"
                  onClick={handleDeleteEvent}
                  className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1.5 rounded hover:bg-rose-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>削除</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEventDate(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveEvent}
                  className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
