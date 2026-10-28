/**
 * 医療・介護向け シフト管理システム データモデル定義
 */

// 雇用形態
export type EmploymentType = 'FULL_TIME' | 'PART_TIME';

// 勤務区分の識別ID
export type ShiftTypeId = 'DAY' | 'EARLY' | 'LATE' | 'NIGHT' | 'NIGHT_NEXT' | 'HOLIDAY' | 'PAID_LEAVE';

// 勤務区分（シフト定義）
export interface ShiftType {
  id: ShiftTypeId;
  name: string;            // '日勤', '早番', '遅番', '夜勤', '明番', '公休', '有休'
  shortName: string;       // '日', '早', '遅', '夜', '明', '休', '有'
  startTime: string;       // '09:00' ('16:00' 等)
  endTime: string;         // '18:00' ('09:00' 等)
  workHours: number;       // 実働時間（例: 日勤8h, 夜勤16h, 休日0h）
  fteWeight: number;       // 常勤換算比率（例: 8h = 1.0, 4h = 0.5, 休日 = 0）
  color: string;           // バッジ背景色 (TailwindクラスまたはHex)
  textColor: string;       // テキスト色
  isWork: boolean;         // 労務計算上の出勤扱いかどうか
  isNight: boolean;        // 夜勤フラグ
}

// スタッフ情報
export interface Staff {
  id: string;
  name: string;
  role: string;                     // '看護師', '介護福祉士', '介護助手' 等
  employmentType: EmploymentType;   // 正社員, パート, 時短パート
  canNightShift: boolean;           // 夜勤可否フラグ
  monthlyMaxHours: number;          // 正社員: 月の契約・法定労働時間上限（変形労働制）
  weeklyMaxHours?: number;          // パート: 週の契約・法定労働時間上限（最大40h）
  minHolidaysPerMonth: number;      // 月間必須公休日数（例: 8日〜10日）
  skillLevel: 1 | 2 | 3 | 4 | 5;    // スキル・役割（1〜5段階）
  ngStaffIds: string[];             // 同一シフト不可のスタッフID（NGペア）
  preferredShiftTypes?: ShiftTypeId[]; // 希望する勤務形態（任意）
}

// 日付別イベント・注記
export interface DayEvent {
  date: string;            // 'YYYY-MM-DD'
  title: string;           // 例: '定期健康診断', '入浴日', 'カンファレンス'
  color?: string;          // イベントラベル色
  notes?: string;
}

// 1日あたりの必要人員要件（スロット数＋時間帯別）
export interface DailyStaffingRequirement {
  date: string;
  targetShiftCounts: Partial<Record<ShiftTypeId, number>>; // 例: { EARLY: 2, DAY: 4, LATE: 2, NIGHT: 1 }
  hourlyRequiredStaff?: Record<string, number>;           // '09:00': 5, '12:00': 4 などの時間帯別最低人員
  minSkillLevelSum?: number;                              // その日の現場合計スキル下限値（例: 10以上）
}

// スタッフの個別希望（希望休・有休・指定出勤など）
export interface ShiftRequest {
  id: string;
  staffId: string;
  date: string;            // 'YYYY-MM-DD'
  requestedShiftId: ShiftTypeId; // 希望するシフト種別（HOLIDAY, PAID_LEAVE 等）
  isPriority: boolean;     // 絶対厳守フラグ（冠婚葬祭・事前有休申請など）
  note?: string;
}

// 1セル（スタッフ × 日付）のシフト割当データ
export interface ShiftAssignment {
  staffId: string;
  date: string;            // 'YYYY-MM-DD'
  shiftTypeId: ShiftTypeId;
  isLocked: boolean;       // 手動確定済みロックフラグ（自動作成時も上書きしない）
  isRequested: boolean;    // 希望による割当フラグ
}

// シフト制約・ルール設定
export interface ConstraintRules {
  maxConsecutiveWorkDays: number;   // 連続勤務日数上限（通常4〜5日）
  nightShiftNextRule: 'HOLIDAY_OR_NEXT' | 'MANDATORY_NEXT'; // 夜勤翌日のルール
  enableNgPairCheck: boolean;       // NGペアの制約有効フラグ
  balanceWeekendShifts: boolean;    // 土日祝の出勤回数平準化
  balanceNightShifts: boolean;      // 夜勤回数の平準化
  minRestHoursBetweenShifts: number;// 勤務間インターバル（例: 遅番翌日の早番禁止：11時間以上推奨）
  defaultRequirements: {
    EARLY: number;
    DAY: number;
    LATE: number;
    NIGHT: number;
  };
}

// ルール違反・警告情報
export interface RuleViolation {
  id: string;
  severity: 'ERROR' | 'WARNING';
  staffId?: string;
  staffName?: string;
  date: string;
  ruleType:
    | 'CONSECUTIVE_DAYS'        // 連勤オーバー
    | 'NIGHT_SHIFT_AFTERMATH'   // 夜勤翌日違反（公休/明番以外）
    | 'NIGHT_NEXT_AFTERMATH'    // 明け翌日違反（休日以外）
    | 'NG_PAIR'                 // NGペア同席
    | 'SHORTAGE'                // 人員不足
    | 'EXCEED_MONTHLY_HOURS'    // 月間労働時間超過（正社員）
    | 'EXCEED_WEEKLY_HOURS'     // 週間労働時間超過（パート・最大40h）
    | 'INTERVAL_SHORTAGE'       // 勤務間インターバル不足
    | 'SKILL_DEFICIT';          // スキル不足
  message: string;
}

// 月間シフトプロジェクト全体データ
export interface MonthlySchedulePlan {
  id: string;
  yearMonth: string;                // 'YYYY-MM'
  name: string;                     // 例: '2026年11月 シフト案'
  staffList: Staff[];
  shiftTypes: Record<ShiftTypeId, ShiftType>;
  assignments: Record<string, ShiftAssignment>; // key: `${staffId}_${date}`
  dailyRequirements: Record<string, DailyStaffingRequirement>; // key: date
  requests: ShiftRequest[];
  events: Record<string, DayEvent>; // key: date
  rules: ConstraintRules;
  updatedAt: string;
}
