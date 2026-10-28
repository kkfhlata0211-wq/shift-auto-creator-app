import { MonthlySchedulePlan, ShiftAssignment, ShiftTypeId, Staff } from '../types/shift';
import { getDaysInMonth } from '../utils/dateUtils';

export interface GenerationOptions {
  preserveLocked?: boolean;
}

export function generateAutomatedSchedule(
  plan: MonthlySchedulePlan,
  options: GenerationOptions = { preserveLocked: true }
): Record<string, ShiftAssignment> {
  const days = getDaysInMonth(plan.yearMonth);
  const newAssignments: Record<string, ShiftAssignment> = {};

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

  // スタッフ毎のカウンター初期化
  const staffWorkHours: Record<string, number> = {};
  const staffWeeklyWorkHours: Record<string, Record<number, number>> = {};
  const staffNightCounts: Record<string, number> = {};
  const staffWeekendCounts: Record<string, number> = {};
  const staffHolidayCounts: Record<string, number> = {};

  plan.staffList.forEach((s) => {
    staffWorkHours[s.id] = 0;
    staffWeeklyWorkHours[s.id] = {};
    staffNightCounts[s.id] = 0;
    staffWeekendCounts[s.id] = 0;
    staffHolidayCounts[s.id] = 0;
  });

  // 初期リクエスト・ロック済みセルの労働時間を積算
  Object.values(newAssignments).forEach((assign) => {
    const shift = plan.shiftTypes[assign.shiftTypeId];
    if (shift?.isWork) {
      const day = days.find((d) => d.date === assign.date);
      if (day) {
        staffWorkHours[assign.staffId] = (staffWorkHours[assign.staffId] || 0) + shift.workHours;
        const wIdx = day.weekIndex;
        if (!staffWeeklyWorkHours[assign.staffId]) staffWeeklyWorkHours[assign.staffId] = {};
        staffWeeklyWorkHours[assign.staffId][wIdx] = (staffWeeklyWorkHours[assign.staffId][wIdx] || 0) + shift.workHours;
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
      if (shiftId && shiftId !== 'HOLIDAY' && shiftId !== 'NIGHT_NEXT') {
        count++;
      } else {
        break;
      }
    }
    return count;
  };

  // 3. 夜勤（NIGHT）と明番（NIGHT_NEXT）の先行割り当て
  // 夜勤可能スタッフ間で回数を平準化
  const nightEligibleStaff = plan.staffList.filter((s) => s.canNightShift);

  days.forEach((day, dayIndex) => {
    // 既に夜勤が割り当てられているか確認
    const existingNightStaff = plan.staffList.find((s) => {
      const key = `${s.id}_${day.date}`;
      return newAssignments[key]?.shiftTypeId === 'NIGHT';
    });

    if (!existingNightStaff && nightEligibleStaff.length > 0) {
      // 候補スタッフの選定（連勤数、翌日の空き、累計夜勤数でソート）
      const candidates = nightEligibleStaff
        .filter((s) => {
          const todayKey = `${s.id}_${day.date}`;
          if (newAssignments[todayKey]?.isLocked || newAssignments[todayKey]?.isRequested) {
            return false;
          }
          // 連勤チェック（夜勤を入れると連勤オーバーしないか）
          const consec = getConsecutiveDaysBefore(s.id, dayIndex);
          if (consec >= plan.rules.maxConsecutiveWorkDays) return false;

          // 翌日にロックされた出勤がないか確認（夜勤翌日は明番または公休・有休）
          if (dayIndex < days.length - 1) {
            const nextDay = days[dayIndex + 1];
            const nextKey = `${s.id}_${nextDay.date}`;
            const nextAssign = newAssignments[nextKey];
            if (nextAssign && (nextAssign.isLocked || nextAssign.isRequested)) {
              if (nextAssign.shiftTypeId !== 'HOLIDAY' && nextAssign.shiftTypeId !== 'PAID_LEAVE') {
                return false;
              }
            }
          }

          // 明けの翌日（2日後）にロックされた出勤がないか確認（明けの次の日は休日）
          if (dayIndex < days.length - 2) {
            const dayAfterNext = days[dayIndex + 2];
            const dayAfterNextKey = `${s.id}_${dayAfterNext.date}`;
            const dayAfterNextAssign = newAssignments[dayAfterNextKey];
            if (dayAfterNextAssign && (dayAfterNextAssign.isLocked || dayAfterNextAssign.isRequested)) {
              if (dayAfterNextAssign.shiftTypeId !== 'HOLIDAY' && dayAfterNextAssign.shiftTypeId !== 'PAID_LEAVE') {
                return false;
              }
            }
          }

          // パートの場合、週上限40hに夜勤（16h）が収まるか確認
          if (s.employmentType === 'PART_TIME') {
            const weekMax = s.weeklyMaxHours || 40;
            const currentWeekHours = staffWeeklyWorkHours[s.id]?.[day.weekIndex] || 0;
            if (currentWeekHours + 16 > weekMax) return false;
          }

          return true;
        })
        .sort((a, b) => {
          // 明けの翌日（dayIndex + 2）に有休・休日の希望が入っているスタッフを優先
          let bonusA = 0;
          let bonusB = 0;
          if (dayIndex < days.length - 2) {
            const d2 = days[dayIndex + 2].date;
            const reqA = plan.requests.find((r) => r.staffId === a.id && r.date === d2);
            const reqB = plan.requests.find((r) => r.staffId === b.id && r.date === d2);
            if (reqA?.requestedShiftId === 'PAID_LEAVE' || reqA?.requestedShiftId === 'HOLIDAY') bonusA += 20;
            if (reqB?.requestedShiftId === 'PAID_LEAVE' || reqB?.requestedShiftId === 'HOLIDAY') bonusB += 20;
          }
          return ((staffNightCounts[a.id] || 0) - bonusA) - ((staffNightCounts[b.id] || 0) - bonusB);
        });

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
        staffNightCounts[selected.id] = (staffNightCounts[selected.id] || 0) + 1;
        staffWorkHours[selected.id] += 16;
        if (!staffWeeklyWorkHours[selected.id]) staffWeeklyWorkHours[selected.id] = {};
        staffWeeklyWorkHours[selected.id][day.weekIndex] =
          (staffWeeklyWorkHours[selected.id][day.weekIndex] || 0) + 16;

        // 翌日は明番（または希望休が既にあればそのまま）
        if (dayIndex < days.length - 1) {
          const nextDay = days[dayIndex + 1];
          const nextKey = `${selected.id}_${nextDay.date}`;
          if (!newAssignments[nextKey]) {
            newAssignments[nextKey] = {
              staffId: selected.id,
              date: nextDay.date,
              shiftTypeId: 'NIGHT_NEXT',
              isLocked: false,
              isRequested: false,
            };
          }
        }

        // 明けの次の日は休（HOLIDAY）。有休（PAID_LEAVE）の希望がある場合はそちらを優先
        if (dayIndex < days.length - 2) {
          const dayAfterNext = days[dayIndex + 2];
          const dayAfterNextKey = `${selected.id}_${dayAfterNext.date}`;
          const existingAssign = newAssignments[dayAfterNextKey];
          const hasPaidLeaveReq = plan.requests.some(
            (r) => r.staffId === selected.id && r.date === dayAfterNext.date && r.requestedShiftId === 'PAID_LEAVE'
          );

          if (hasPaidLeaveReq || existingAssign?.shiftTypeId === 'PAID_LEAVE') {
            newAssignments[dayAfterNextKey] = {
              staffId: selected.id,
              date: dayAfterNext.date,
              shiftTypeId: 'PAID_LEAVE',
              isLocked: existingAssign?.isLocked || false,
              isRequested: true,
            };
          } else if (!existingAssign) {
            newAssignments[dayAfterNextKey] = {
              staffId: selected.id,
              date: dayAfterNext.date,
              shiftTypeId: 'HOLIDAY',
              isLocked: false,
              isRequested: false,
            };
            staffHolidayCounts[selected.id] = (staffHolidayCounts[selected.id] || 0) + 1;
          }
        }
      }
    }
  });

  // 4. 日中のシフト割当（早番・遅番・日勤・公休）
  days.forEach((day, dayIndex) => {
    // この日に入れないといけない目標シフト枠（設定値より構築）
    const reqEarly = plan.rules.defaultRequirements?.EARLY ?? 1;
    const reqDay = plan.rules.defaultRequirements?.DAY ?? 2;
    const reqLate = plan.rules.defaultRequirements?.LATE ?? 1;

    const neededShifts: ShiftTypeId[] = [
      ...Array(reqEarly).fill('EARLY'),
      ...Array(reqDay).fill('DAY'),
      ...Array(reqLate).fill('LATE'),
    ];

    // 既に割当済みのスタッフを除外
    const unassignedStaff = plan.staffList.filter((s) => {
      const key = `${s.id}_${day.date}`;
      return !newAssignments[key];
    });

    // スコアリングソート関数（公平性とルール遵守）
    const getCandidateScore = (staff: Staff, shiftId: ShiftTypeId): number => {
      let score = 0;
      const consec = getConsecutiveDaysBefore(staff.id, dayIndex);

      // 明けの次の日は休とする（前日が明番の場合は出勤不可）
      if (dayIndex > 0) {
        const prevDay = days[dayIndex - 1];
        const prevKey = `${staff.id}_${prevDay.date}`;
        if (newAssignments[prevKey]?.shiftTypeId === 'NIGHT_NEXT') {
          return -9999;
        }
      }

      // 連勤上限に近い場合は出勤スコアを下げる
      if (consec >= plan.rules.maxConsecutiveWorkDays) {
        return -9999;
      }
      score -= consec * 20;

      // パート: 週単位（最大40h）のチェック
      // 正社員: 月単位の契約上限時間のチェック
      if (staff.employmentType === 'PART_TIME') {
        const weekMax = staff.weeklyMaxHours || 40;
        const currentWeekHours = staffWeeklyWorkHours[staff.id]?.[day.weekIndex] || 0;
        if (currentWeekHours + 8 > weekMax) {
          return -9999;
        }
        score += (weekMax - currentWeekHours) * 2;
      } else {
        const hoursRemaining = staff.monthlyMaxHours - staffWorkHours[staff.id];
        if (hoursRemaining < 8) return -9999;
        score += hoursRemaining;
      }

      // 土日の出勤平準化
      if (day.isWeekend && plan.rules.balanceWeekendShifts) {
        score -= (staffWeekendCounts[staff.id] || 0) * 30;
      }

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
      const eligible = unassignedStaff
        .filter((staff) => {
          // 同じシフトにNGスタッフが既にいるかチェック
          if (plan.rules.enableNgPairCheck && staff.ngStaffIds?.length) {
            const hasConflict = Object.values(newAssignments).some((assign) => {
              return (
                assign.date === day.date &&
                assign.shiftTypeId === shiftId &&
                staff.ngStaffIds.includes(assign.staffId)
              );
            });
            if (hasConflict) return false;
          }
          return getCandidateScore(staff, shiftId) > -5000;
        })
        .sort((a, b) => getCandidateScore(b, shiftId) - getCandidateScore(a, shiftId));

      if (eligible.length > 0) {
        const chosen = eligible[0];
        const key = `${chosen.id}_${day.date}`;
        newAssignments[key] = {
          staffId: chosen.id,
          date: day.date,
          shiftTypeId: shiftId,
          isLocked: false,
          isRequested: false,
        };

        staffWorkHours[chosen.id] += 8;
        if (!staffWeeklyWorkHours[chosen.id]) staffWeeklyWorkHours[chosen.id] = {};
        staffWeeklyWorkHours[chosen.id][day.weekIndex] =
          (staffWeeklyWorkHours[chosen.id][day.weekIndex] || 0) + 8;

        if (day.isWeekend) staffWeekendCounts[chosen.id] = (staffWeekendCounts[chosen.id] || 0) + 1;

        // unassignedStaff から除外
        const idx = unassignedStaff.findIndex((s) => s.id === chosen.id);
        if (idx !== -1) unassignedStaff.splice(idx, 1);
      }
    });

    // 枠に選ばれなかったスタッフは「休日（休）」または「日勤（余剰・研修など）」
    unassignedStaff.forEach((staff) => {
      const key = `${staff.id}_${day.date}`;
      const consec = getConsecutiveDaysBefore(staff.id, dayIndex);

      // 前日が明番の場合、明けの次は休（有休希望があれば有休優先）
      const prevDayWasNightNext =
        dayIndex > 0 &&
        newAssignments[`${staff.id}_${days[dayIndex - 1].date}`]?.shiftTypeId === 'NIGHT_NEXT';

      const hasPaidLeaveReq = plan.requests.some(
        (r) => r.staffId === staff.id && r.date === day.date && r.requestedShiftId === 'PAID_LEAVE'
      );

      // 労働時間上限の判定
      const isPartTime = staff.employmentType === 'PART_TIME';
      const weeklyMax = staff.weeklyMaxHours || 40;
      const currentWeekHours = staffWeeklyWorkHours[staff.id]?.[day.weekIndex] || 0;
      const weeklyOver = isPartTime && currentWeekHours + 8 > weeklyMax;
      const monthlyOver = !isPartTime && staff.monthlyMaxHours - staffWorkHours[staff.id] < 8;

      // 休日または有休を割り当てるべき条件
      if (
        prevDayWasNightNext ||
        weeklyOver ||
        monthlyOver ||
        consec >= 3 ||
        staffHolidayCounts[staff.id] < staff.minHolidaysPerMonth
      ) {
        const targetShift: ShiftTypeId =
          prevDayWasNightNext && hasPaidLeaveReq ? 'PAID_LEAVE' : 'HOLIDAY';

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
          staffWorkHours[staff.id] += 8;
        }
      } else {
        // 余力があるスタッフは日勤
        newAssignments[key] = {
          staffId: staff.id,
          date: day.date,
          shiftTypeId: 'DAY',
          isLocked: false,
          isRequested: false,
        };
        staffWorkHours[staff.id] += 8;
        if (!staffWeeklyWorkHours[staff.id]) staffWeeklyWorkHours[staff.id] = {};
        staffWeeklyWorkHours[staff.id][day.weekIndex] =
          (staffWeeklyWorkHours[staff.id][day.weekIndex] || 0) + 8;

        if (day.isWeekend) staffWeekendCounts[staff.id] = (staffWeekendCounts[staff.id] || 0) + 1;
      }
    });
  });

  return newAssignments;
}
