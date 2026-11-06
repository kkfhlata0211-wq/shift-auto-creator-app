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

  // 2.5 パートの曜日固定シフトの反映（希望休・ロックがない場合）
  plan.staffList.forEach((staff) => {
    if (staff.employmentType === 'PART_TIME' && staff.fixedDayShifts) {
      days.forEach((day) => {
        const fixedShiftId = staff.fixedDayShifts![day.dayOfWeekIndex];
        const key = `${staff.id}_${day.date}`;
        if (fixedShiftId && !newAssignments[key]) {
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
  const staffNightCounts: Record<string, number> = {};
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
    staffNightCounts[s.id] = 0;
    staffWeekendCounts[s.id] = 0;
    staffHolidayCounts[s.id] = 0;
    staffDayShiftCounts[s.id] = { EARLY: 0, DAY: 0, LATE: 0 };

    if (s.employmentType === 'FULL_TIME') {
      const targetHours = plan.targetMonthlyHours || s.monthlyMaxHours;
      const targetWorkDays = Math.round(targetHours / 8);
      targetHolidaysMap[s.id] = Math.max(s.minHolidaysPerMonth, totalDays - targetWorkDays);
    } else {
      const targetWorkDays = Math.round(s.monthlyMaxHours / 8);
      targetHolidaysMap[s.id] = Math.max(s.minHolidaysPerMonth, totalDays - targetWorkDays);
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

  // 初期リクエスト・固定・ロック済みセルの労働時間を積算
  Object.values(newAssignments).forEach((assign) => {
    const shift = plan.shiftTypes[assign.shiftTypeId];
    addDayShiftCount(assign.staffId, assign.shiftTypeId);
    if (assign.shiftTypeId === 'HOLIDAY' || assign.shiftTypeId === 'PAID_LEAVE') {
      staffHolidayCounts[assign.staffId] = (staffHolidayCounts[assign.staffId] || 0) + 1;
    }
    if (shift?.isWork) {
      const day = days.find((d) => d.date === assign.date);
      if (day) {
        staffWorkHours[assign.staffId] = (staffWorkHours[assign.staffId] || 0) + shift.workHours;
        const wIdx = day.weekIndex;
        if (!staffWeeklyWorkHours[assign.staffId]) staffWeeklyWorkHours[assign.staffId] = {};
        staffWeeklyWorkHours[assign.staffId][wIdx] = (staffWeeklyWorkHours[assign.staffId][wIdx] || 0) + shift.workHours;

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
      if (shiftId && shiftId !== 'HOLIDAY' && shiftId !== 'NIGHT_NEXT') {
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
      if (shiftId === 'HOLIDAY' || shiftId === 'PAID_LEAVE') {
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
          if (newAssignments[todayKey]) return false;
          // 連勤チェック（夜勤を入れると連勤オーバーしないか）
          const consec = getConsecutiveDaysBefore(s.id, dayIndex);
          if (consec >= plan.rules.maxConsecutiveWorkDays) return false;

          // 前回の夜勤から3日以内は夜勤不可（夜・明・休のサイクルを確保）
          const daysSinceNight = getDaysSinceLastNight(s.id, dayIndex);
          if (daysSinceNight < 4) return false;

          // 翌日にロックされた出勤がないか確認（夜勤翌日は明番または公休・有休）
          if (dayIndex < days.length - 1) {
            const nextDay = days[dayIndex + 1];
            const nextKey = `${s.id}_${nextDay.date}`;
            const nextAssign = newAssignments[nextKey];
            if (nextAssign) {
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
            if (dayAfterNextAssign) {
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
            if (staffWorkHours[s.id] + 16 > s.monthlyMaxHours) return false;
            const maxAllowedDays = s.allowedWeeklyWorkDays?.length
              ? Math.max(...s.allowedWeeklyWorkDays)
              : 99;
            if ((staffWeeklyWorkDaysCount[s.id]?.[day.weekIndex] || 0) >= maxAllowedDays) return false;
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

          // 夜勤回数の少なさを最優先し、回数が同じなら前回の夜勤から日数が空いているスタッフを優先（月間均等分散）
          const countDiff = (staffNightCounts[a.id] || 0) - (staffNightCounts[b.id] || 0);
          if (countDiff !== 0) return countDiff - (bonusA - bonusB);

          const daysA = Math.min(getDaysSinceLastNight(a.id, dayIndex), 30);
          const daysB = Math.min(getDaysSinceLastNight(b.id, dayIndex), 30);
          return (daysB - bonusB) - (daysA - bonusA);
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
        staffWeeklyWorkDaysCount[selected.id][day.weekIndex] =
          (staffWeeklyWorkDaysCount[selected.id][day.weekIndex] || 0) + 1;

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
      const weekMax = staff.weeklyMaxHours || 40;
      const targetDays = staff.allowedWeeklyWorkDays?.length
        ? Math.min(...staff.allowedWeeklyWorkDays)
        : Math.floor(weekMax / 8);

      return (
        currentDays < targetDays &&
        currentWeekHours + 8 <= weekMax &&
        staffWorkHours[staff.id] + 8 <= staff.monthlyMaxHours
      );
    };

    // スコアリングソート関数（公平性とルール遵守）
    const getCandidateScore = (
      staff: Staff,
      shiftId: ShiftTypeId,
      allowLimitOverrides = false
    ): number => {
      let score = 0;
      const consec = getConsecutiveDaysBefore(staff.id, dayIndex);
      const consecHolidays = getConsecutiveHolidaysBefore(staff.id, dayIndex);

      // 明けの次の日は休とする（前日が明番の場合は出勤不可）
      if (dayIndex > 0) {
        const prevDay = days[dayIndex - 1];
        const prevKey = `${staff.id}_${prevDay.date}`;
        if (newAssignments[prevKey]?.shiftTypeId === 'NIGHT_NEXT') {
          return -9999;
        }
      }

      // 連勤上限チェック
      if (consec >= plan.rules.maxConsecutiveWorkDays) {
        if (!allowLimitOverrides) return -9999;
        score -= 500 + (consec - plan.rules.maxConsecutiveWorkDays + 1) * 100;
      }

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
        const weekMax = staff.weeklyMaxHours || 40;
        const currentWeekHours = staffWeeklyWorkHours[staff.id]?.[day.weekIndex] || 0;
        const shiftHours = plan.shiftTypes[shiftId]?.workHours ?? 8;
        if (
          currentWeekHours + shiftHours > weekMax ||
          staffWorkHours[staff.id] + shiftHours > staff.monthlyMaxHours
        ) {
          if (!allowLimitOverrides) return -9999;
          score -= 500 +
            Math.max(0, currentWeekHours + shiftHours - weekMax) * 20 +
            Math.max(0, staffWorkHours[staff.id] + shiftHours - staff.monthlyMaxHours) * 20;
        }

        score += 60;

        // 週の勤務日数（複数選択可）の上限チェック
        if (staff.allowedWeeklyWorkDays && staff.allowedWeeklyWorkDays.length > 0) {
          const maxAllowedDays = Math.max(...staff.allowedWeeklyWorkDays);
          const currentDays = staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0;
          if (currentDays >= maxAllowedDays) {
            if (!allowLimitOverrides) return -9999;
            score -= 500 + (currentDays - maxAllowedDays + 1) * 100;
          }
          const minAllowedDays = Math.min(...staff.allowedWeeklyWorkDays);
          if (currentDays < minAllowedDays) {
            score += (minAllowedDays - currentDays) * 30;
          }
        }

        score += (weekMax - currentWeekHours) * 2;
      } else {
        const hoursRemaining = staff.monthlyMaxHours - staffWorkHours[staff.id];
        if (hoursRemaining < 8) {
          if (!allowLimitOverrides) return -9999;
          score -= 500 + (8 - hoursRemaining) * 20;
        }

        // 正社員: 週休2日ペースの管理（週5日勤務を上限とする）
        const currentWeeklyDays = staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0;
        if (currentWeeklyDays >= 5) {
          if (!allowLimitOverrides) return -9999;
          score -= 500 + (currentWeeklyDays - 4) * 100;
        } else if (currentWeeklyDays === 4) {
          score -= 80; // すでに週4日出勤している場合は休日を強く推奨
        } else if (currentWeeklyDays <= 2) {
          score += 25;
        }

        // 月の所定労働時間の進度ペース（前倒し勤務の防止・月全体への均等化）
        const targetHours = plan.targetMonthlyHours || staff.monthlyMaxHours;
        const expectedHoursToDate = targetHours * dayProgress;
        const hourDiff = (staffWorkHours[staff.id] + 8) - expectedHoursToDate;

        if (hourDiff > 8) {
          // 進度より働きすぎている場合は減点して休日を促す
          score -= hourDiff * 12;
        } else if (hourDiff < -8) {
          // 進度より遅れている場合は出勤を促す
          score += (-hourDiff) * 8;
        }

        // 目標所定労働時間をすでに満たしている場合は優先度を下げる
        if (staffWorkHours[staff.id] + 8 > targetHours) {
          score -= 400;
        }
      }

      // 土日の出勤平準化
      if (day.isWeekend && plan.rules.balanceWeekendShifts) {
        score -= (staffWeekendCounts[staff.id] || 0) * 30;
      }

      // 早番・日勤・遅番の担当回数をシフトごとに平準化
      score -= getDayShiftCount(staff.id, shiftId) * 40;

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

      const eligible = unassignedStaff
        .filter((staff) => {
          return !hasNgConflict(staff) && getCandidateScore(staff, shiftId) > -5000;
        })
        .sort((a, b) => {
          const partTimePriority =
            Number(hasPartTimeWorkCapacity(b)) - Number(hasPartTimeWorkCapacity(a));
          return partTimePriority || getCandidateScore(b, shiftId) - getCandidateScore(a, shiftId);
        });

      const emergencyEligible = eligible.length === 0
        ? unassignedStaff
            .filter((staff) => !hasNgConflict(staff) && getCandidateScore(staff, shiftId, true) > -9999)
            .sort((a, b) => {
              const partTimePriority =
                Number(hasPartTimeWorkCapacity(b)) - Number(hasPartTimeWorkCapacity(a));
              return partTimePriority ||
                getCandidateScore(b, shiftId, true) - getCandidateScore(a, shiftId, true);
            })
        : [];
      const chosen = eligible[0] || emergencyEligible[0];

      if (chosen) {
        const key = `${chosen.id}_${day.date}`;
        newAssignments[key] = {
          staffId: chosen.id,
          date: day.date,
          shiftTypeId: shiftId,
          isLocked: false,
          isRequested: false,
        };
        addDayShiftCount(chosen.id, shiftId);

        staffWorkHours[chosen.id] += 8;
        if (!staffWeeklyWorkHours[chosen.id]) staffWeeklyWorkHours[chosen.id] = {};
        staffWeeklyWorkHours[chosen.id][day.weekIndex] =
          (staffWeeklyWorkHours[chosen.id][day.weekIndex] || 0) + 8;

        if (!staffWeeklyWorkDaysCount[chosen.id]) staffWeeklyWorkDaysCount[chosen.id] = {};
        staffWeeklyWorkDaysCount[chosen.id][day.weekIndex] =
          (staffWeeklyWorkDaysCount[chosen.id][day.weekIndex] || 0) + 1;

        if (day.isWeekend) staffWeekendCounts[chosen.id] = (staffWeekendCounts[chosen.id] || 0) + 1;

        // unassignedStaff から除外
        const idx = unassignedStaff.findIndex((s) => s.id === chosen.id);
        if (idx !== -1) unassignedStaff.splice(idx, 1);
      }
    });

    // 枠に選ばれなかったスタッフの処理（原則は休日・公休）
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

      const isPartTime = staff.employmentType === 'PART_TIME';
      const monthlyOver = !isPartTime && staff.monthlyMaxHours - staffWorkHours[staff.id] < 8;

      // 正社員の週勤務日数
      const fullTimeDaysInWeek = !isPartTime
        ? (staffWeeklyWorkDaysCount[staff.id]?.[day.weekIndex] || 0)
        : 0;

      // 残り日数すべて出勤しても月間所定労働時間（monthlyMaxHours）に届かないか判定
      const remainingDays = totalDays - (dayIndex + 1);
      const remainingPotentialHours = remainingDays * 8;
      const isSeverelyBehindHours =
        !isPartTime &&
        staffWorkHours[staff.id] + remainingPotentialHours < staff.monthlyMaxHours;

      // 正社員で、極端に労働時間が不足しており、かつ連勤・週休ルールに余裕がある場合のみ追加日勤
      const canAddExtraDayShift =
        !isPartTime &&
        isSeverelyBehindHours &&
        !prevDayWasNightNext &&
        !monthlyOver &&
        consec < 3 &&
        fullTimeDaysInWeek < 5;

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
          staffWorkHours[staff.id] += 8;
        }
      }
    });
  });

  return newAssignments;
}
