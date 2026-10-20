import React, { useState } from 'react';
import { Lock, Unlock, Moon, Star, Calendar } from 'lucide-react';
import { MonthlySchedulePlan, ShiftTypeId } from '../types/shift';
import { getDaysInMonth, CalendarDay } from '../utils/dateUtils';
import { ValidationSummary } from '../engine/validator';

interface ShiftMatrixProps {
  plan: MonthlySchedulePlan;
  validation: ValidationSummary;
  onUpdateAssignment: (staffId: string, date: string, shiftTypeId: ShiftTypeId, isLocked?: boolean) => void;
  onToggleLock: (staffId: string, date: string) => void;
}

export const ShiftMatrix: React.FC<ShiftMatrixProps> = ({
  plan,
  validation,
  onUpdateAssignment,
  onToggleLock,
}) => {
  const days: CalendarDay[] = getDaysInMonth(plan.yearMonth);

  // ポップオーバーで選択中のセル
  const [activeCell, setActiveCell] = useState<{
    staffId: string;
    date: string;
  } | null>(null);

  const getShiftBadge = (shiftId?: ShiftTypeId) => {
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
        className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold border transition-transform hover:scale-105 shadow-xs ${def.color}`}
        title={`${def.name} (${def.startTime}〜${def.endTime}, 実働${def.workHours}h)`}
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

        <div className="flex items-center gap-4 text-slate-500">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-amber-500" /> 手動確定ロック
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
          <table className="min-w-full border-collapse text-left text-xs">
            {/* カレンダーヘッダー */}
            <thead>
              {/* イベント行 */}
              <tr className="bg-slate-50 border-b border-slate-200">
                <th
                  colSpan={3}
                  className="sticky left-0 z-30 bg-slate-50 px-3 py-1.5 font-bold text-slate-700 border-r border-slate-200"
                >
                  <div className="flex items-center gap-1 text-slate-600">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>行事・イベント</span>
                  </div>
                </th>
                {days.map((day) => {
                  const event = plan.events[day.date];
                  return (
                    <th
                      key={`event_${day.date}`}
                      className="px-1 py-1 text-center font-normal border-r border-slate-100 min-w-[38px] max-w-[38px]"
                      title={event ? `${event.title}: ${event.notes || ''}` : undefined}
                    >
                      {event ? (
                        <div
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium cursor-help ${
                            event.color || 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {event.title.slice(0, 3)}
                        </div>
                      ) : null}
                    </th>
                  );
                })}
              </tr>

              {/* 日付・曜日行 */}
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="sticky left-0 z-30 bg-slate-100 px-3 py-2 font-bold text-slate-700 w-36 border-r border-slate-200">
                  スタッフ氏名
                </th>
                <th className="sticky left-36 z-30 bg-slate-100 px-2 py-2 font-bold text-slate-700 w-24 border-r border-slate-200 text-center">
                  職種 / スキル
                </th>
                <th className="sticky left-60 z-30 bg-slate-100 px-2 py-2 font-bold text-slate-700 w-24 border-r border-slate-200 text-center">
                  当月労働時間
                </th>
                {days.map((day) => {
                  const isSun = day.isSunday;
                  const isSat = day.isSaturday;
                  const dayColor = isSun
                    ? 'text-rose-600 bg-rose-50'
                    : isSat
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-slate-700';

                  return (
                    <th
                      key={day.date}
                      className={`px-1 py-1.5 text-center border-r border-slate-200 min-w-[38px] max-w-[38px] ${dayColor}`}
                    >
                      <div className="font-bold text-sm leading-none">{day.dayNumber}</div>
                      <div className="text-[10px] font-semibold mt-0.5">({day.dayOfWeek})</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* スタッフ行 */}
            <tbody className="divide-y divide-slate-100">
              {plan.staffList.map((staff) => {
                const hoursInfo = validation.staffHoursSummary[staff.id] || {
                  totalHours: 0,
                  maxHours: staff.monthlyMaxHours,
                  isOver: false,
                };

                return (
                  <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                    {/* スタッフ名 */}
                    <td className="sticky left-0 z-20 bg-white hover:bg-slate-50 px-3 py-2 border-r border-slate-200">
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
                            {staff.employmentType === 'FULL_TIME'
                              ? '常勤'
                              : staff.employmentType === 'PART_TIME'
                              ? 'パート'
                              : '時短'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 役職・スキル */}
                    <td className="sticky left-36 z-20 bg-white hover:bg-slate-50 px-2 py-2 border-r border-slate-200 text-center">
                      <div className="text-[11px] font-medium text-slate-700">{staff.role}</div>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5" title={`スキル評価: ${staff.skillLevel}/5`}>
                        {Array.from({ length: staff.skillLevel }).map((_, i) => (
                          <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </td>

                    {/* 労働時間 */}
                    <td
                      className={`sticky left-60 z-20 bg-white hover:bg-slate-50 px-2 py-2 border-r border-slate-200 text-center ${
                        hoursInfo.isOver ? 'bg-rose-50' : ''
                      }`}
                    >
                      <div
                        className={`text-xs font-bold ${
                          hoursInfo.isOver ? 'text-rose-600' : 'text-slate-700'
                        }`}
                      >
                        {hoursInfo.totalHours}h
                      </div>
                      <div className="text-[10px] text-slate-400">/ 上限{staff.monthlyMaxHours}h</div>
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
                          onClick={() => setActiveCell({ staffId: staff.id, date: day.date })}
                          className={`relative p-1 text-center border-r border-slate-100 cursor-pointer select-none group min-w-[38px] max-w-[38px] ${
                            hasViolation ? 'bg-rose-50 ring-1 ring-inset ring-rose-300' : ''
                          }`}
                        >
                          <div className="flex items-center justify-center relative">
                            {getShiftBadge(shiftId)}

                            {/* ロックアイコン */}
                            {isLocked && (
                              <Lock className="w-2.5 h-2.5 text-amber-600 absolute -top-1 -right-1" />
                            )}

                            {/* 違反インジケーター */}
                            {hasViolation && (
                              <span
                                className="w-2 h-2 bg-rose-500 rounded-full absolute -top-1 -left-1 ring-2 ring-white"
                                title={cellViolations.map((v) => v.message).join('\n')}
                              />
                            )}

                            {/* 希望休アイコン */}
                            {isRequested && (
                              <span
                                className="text-[8px] bg-blue-600 text-white rounded-full w-2.5 h-2.5 absolute -bottom-1 -right-1 flex items-center justify-center font-bold"
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
                <td colSpan={3} className="sticky left-0 z-20 bg-amber-50/80 px-3 py-1 font-bold text-slate-700 border-r border-slate-200">
                  早番 人数 (必要: {plan.rules.defaultRequirements?.EARLY ?? 1})
                </td>
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualEarly || 0) < (plan.rules.defaultRequirements?.EARLY ?? 1);
                  return (
                    <td
                      key={`early_${day.date}`}
                      className={`text-center font-bold text-xs py-1 border-r border-slate-200 ${
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
                <td colSpan={3} className="sticky left-0 z-20 bg-blue-50/80 px-3 py-1 font-bold text-slate-700 border-r border-slate-200">
                  日勤 人数 (必要: {plan.rules.defaultRequirements?.DAY ?? 2})
                </td>
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualDay || 0) < (plan.rules.defaultRequirements?.DAY ?? 2);
                  return (
                    <td
                      key={`day_${day.date}`}
                      className={`text-center font-bold text-xs py-1 border-r border-slate-200 ${
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
                <td colSpan={3} className="sticky left-0 z-20 bg-orange-50/80 px-3 py-1 font-bold text-slate-700 border-r border-slate-200">
                  遅番 人数 (必要: {plan.rules.defaultRequirements?.LATE ?? 1})
                </td>
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualLate || 0) < (plan.rules.defaultRequirements?.LATE ?? 1);
                  return (
                    <td
                      key={`late_${day.date}`}
                      className={`text-center font-bold text-xs py-1 border-r border-slate-200 ${
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
                <td colSpan={3} className="sticky left-0 z-20 bg-purple-50/80 px-3 py-1 font-bold text-slate-700 border-r border-slate-200">
                  夜勤 人数 (必要: {plan.rules.defaultRequirements?.NIGHT ?? 1})
                </td>
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = (cov?.actualNight || 0) < (plan.rules.defaultRequirements?.NIGHT ?? 1);
                  return (
                    <td
                      key={`night_${day.date}`}
                      className={`text-center font-bold text-xs py-1 border-r border-slate-200 ${
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
                <td colSpan={3} className="sticky left-0 z-20 bg-slate-100 px-3 py-1.5 font-bold text-slate-800 border-r border-slate-200">
                  人員充足判定 (FTE基準)
                </td>
                {days.map((day) => {
                  const cov = validation.dailyCoverageSummary[day.date];
                  const isDeficit = cov?.isDeficit;
                  return (
                    <td
                      key={`status_${day.date}`}
                      className={`text-center text-[10px] font-bold py-1 border-r border-slate-200 ${
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
                className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
              >
                {plan.assignments[`${activeCell.staffId}_${activeCell.date}`]?.isLocked ? (
                  <>
                    <Lock className="w-3 h-3 text-amber-600" />
                    <span>ロック解除</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3 text-slate-500" />
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
    </div>
  );
};
