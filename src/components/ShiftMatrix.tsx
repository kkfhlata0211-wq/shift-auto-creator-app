import React, { useState } from 'react';
import { Lock, Unlock, Moon, Star, Calendar, Plus, Trash2, Check, X } from 'lucide-react';
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

  // ポップオーバーで選択中のセル
  const [activeCell, setActiveCell] = useState<{
    staffId: string;
    date: string;
  } | null>(null);

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
          <table className="border-separate border-spacing-0 text-left text-xs table-fixed">
            {/* カラム幅をブラウザの拡大縮小時もピクセル単位で厳格固定 */}
            <colgroup>
              <col style={{ width: 150, minWidth: 150, maxWidth: 150 }} />
              <col style={{ width: 110, minWidth: 110, maxWidth: 110 }} />
              <col style={{ width: 95, minWidth: 95, maxWidth: 95 }} />
              {days.map((day) => (
                <col key={day.date} style={{ width: 42, minWidth: 42, maxWidth: 42 }} />
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
                  労働時間
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
                      style={{ width: 42 }}
                      className={`px-1 py-1.5 text-center border-b border-r border-slate-200 ${dayColor}`}
                    >
                      <div className="font-bold text-sm leading-none">{day.dayNumber}</div>
                      <div className="text-[10px] font-semibold mt-0.5">({day.dayOfWeek})</div>
                    </th>
                  );
                })}
              </tr>

              {/* 2段目: 行事・イベント行（日付の下に配置＆編集可能） */}
              <tr className="bg-slate-50">
                <th
                  style={{ left: 0, width: 150 }}
                  className="sticky left-0 z-30 bg-slate-50 px-3 py-1 font-bold text-slate-600 border-b border-r border-slate-200"
                >
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>行事・イベント</span>
                  </div>
                </th>
                <th
                  style={{ left: 150, width: 110 }}
                  className="sticky left-[150px] z-30 bg-slate-50 border-b border-r border-slate-200"
                />
                <th
                  style={{ left: 260, width: 95 }}
                  className="sticky left-[260px] z-30 bg-slate-50 border-b border-r border-slate-200 text-center text-[10px] text-slate-400 font-normal"
                >
                  クリック編集
                </th>
                {days.map((day) => {
                  const event = plan.events[day.date];
                  return (
                    <th
                      key={`event_${day.date}`}
                      style={{ width: 42 }}
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
              </tr>
            </thead>

            {/* スタッフ行 */}
            <tbody>
              {sortedStaffList.map((staff) => {
                const hoursInfo = validation.staffHoursSummary[staff.id] || {
                  totalHours: 0,
                  maxHours: staff.monthlyMaxHours,
                  isOver: false,
                  maxWeekHours: 0,
                  isWeeklyOver: false,
                };

                return (
                  <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                    {/* スタッフ名 */}
                    <td
                      style={{ left: 0, width: 150 }}
                      className="sticky left-0 z-20 bg-white hover:bg-slate-50 px-3 py-2 border-b border-r border-slate-200"
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
                          <div className="text-[10px] text-slate-400">
                            {staff.employmentType === 'FULL_TIME' ? '正社員' : 'パート'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 役職・スキル */}
                    <td
                      style={{ left: 150, width: 110 }}
                      className="sticky left-[150px] z-20 bg-white hover:bg-slate-50 px-2 py-2 border-b border-r border-slate-200 text-center"
                    >
                      <div className="text-[11px] font-medium text-slate-700">{staff.role}</div>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5" title={`スキル評価: ${staff.skillLevel}/5`}>
                        {Array.from({ length: staff.skillLevel }).map((_, i) => (
                          <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </td>

                    {/* 労働時間 */}
                    <td
                      style={{ left: 260, width: 95 }}
                      className={`sticky left-[260px] z-20 bg-white hover:bg-slate-50 px-2 py-2 border-b border-r border-slate-200 text-center ${
                        hoursInfo.isOver || hoursInfo.targetHoursMismatch ? 'bg-amber-50/70' : ''
                      }`}
                    >
                      {staff.employmentType === 'PART_TIME' ? (
                        <div
                          className={`text-xs font-bold ${
                            hoursInfo.isOver ? 'text-rose-600' : 'text-blue-700'
                          }`}
                          title={`パート週最大実働: ${hoursInfo.maxWeekHours}h（週上限: ${staff.weeklyMaxHours || 40}h）`}
                        >
                          最大 {hoursInfo.maxWeekHours}h/週
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
                      const isRequested = assign?.isRequested || false;
                      const cellViolations = validation.violationsByStaffAndDate[key] || [];
                      const hasViolation = cellViolations.length > 0;

                      return (
                        <td
                          key={day.date}
                          style={{ width: 42 }}
                          onClick={() => setActiveCell({ staffId: staff.id, date: day.date })}
                          className={`relative p-1 text-center border-b border-r border-slate-200 cursor-pointer select-none group ${
                            isLocked ? 'bg-amber-50/50' : ''
                          } ${
                            hasViolation ? 'bg-rose-50 ring-1 ring-inset ring-rose-300' : ''
                          }`}
                        >
                          <div className="flex items-center justify-center relative">
                            {getShiftBadge(shiftId, isLocked)}

                            {/* ロックアイコン（大きく見やすいバッジ） */}
                            {isLocked && (
                              <span
                                className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-0.5 shadow-md ring-1.5 ring-white z-10 flex items-center justify-center"
                                title="変更を固定中（自動作成時も維持されます）"
                              >
                                <Lock className="w-3 h-3 stroke-[2.5]" />
                              </span>
                            )}

                            {/* 違反インジケーター */}
                            {hasViolation && (
                              <span
                                className="w-2 h-2 bg-rose-500 rounded-full absolute -top-1 -left-1 ring-2 ring-white z-10"
                                title={cellViolations.map((v) => v.message).join('\n')}
                              />
                            )}

                            {/* 希望休アイコン */}
                            {isRequested && (
                              <span
                                className="text-[8px] bg-blue-600 text-white rounded-full w-2.5 h-2.5 absolute -bottom-1 -right-1 flex items-center justify-center font-bold z-10"
                                title="スタッフ希望"
                              >
                                希
                              </span>
                            )}
                          </div>
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
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualEarly || 0) < (plan.rules.defaultRequirements?.EARLY ?? 1);
                  return (
                    <td
                      key={`early_${day.date}`}
                      style={{ width: 42 }}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualEarly || 0}
                    </td>
                  );
                })}
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
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualDay || 0) < (plan.rules.defaultRequirements?.DAY ?? 2);
                  return (
                    <td
                      key={`day_${day.date}`}
                      style={{ width: 42 }}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualDay || 0}
                    </td>
                  );
                })}
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
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualLate || 0) < (plan.rules.defaultRequirements?.LATE ?? 1);
                  return (
                    <td
                      key={`late_${day.date}`}
                      style={{ width: 42 }}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualLate || 0}
                    </td>
                  );
                })}
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
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualNight || 0) < (plan.rules.defaultRequirements?.NIGHT ?? 1);
                  return (
                    <td
                      key={`night_${day.date}`}
                      style={{ width: 42 }}
                      className={`text-center font-bold text-xs py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-200 text-rose-800' : 'text-slate-700'
                      }`}
                    >
                      {cov?.actualNight || 0}
                    </td>
                  );
                })}
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
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = cov?.isDeficit;
                  return (
                    <td
                      key={`status_${day.date}`}
                      style={{ width: 42 }}
                      className={`text-center text-[10px] font-bold py-1 border-b border-r border-slate-200 ${
                        isDeficit ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {isDeficit ? '不足' : '充足'}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* セル編集用クイックポップオーバー */}
      {activeCell && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setActiveCell(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <span className="font-bold text-sm text-slate-800">
                {activeCell.date} 勤務変更
              </span>
              <button
                onClick={() => onToggleLock(activeCell.staffId, activeCell.date)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all shadow-xs ${
                  plan.assignments[`${activeCell.staffId}_${activeCell.date}`]?.isLocked
                    ? 'bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="自動作成時にこのセルの勤務区分を変更されないよう固定します"
              >
                {plan.assignments[`${activeCell.staffId}_${activeCell.date}`]?.isLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>固定中（解除）</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-slate-500" />
                    <span>変更を固定</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {Object.values(plan.shiftTypes).map((st) => (
                <button
                  key={st.id}
                  onClick={() => {
                    onUpdateAssignment(activeCell.staffId, activeCell.date, st.id);
                    setActiveCell(null);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-semibold hover:shadow-md transition-all ${st.color}`}
                >
                  <span className="w-5 h-5 flex items-center justify-center rounded bg-white/70 shadow-xs">
                    {st.shortName}
                  </span>
                  <span>{st.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
