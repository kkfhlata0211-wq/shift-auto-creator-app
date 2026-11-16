/**
 * SQLite (sql.js) を利用したブラウザ内データベース
 * - IndexedDB にデータベースファイルを永続化
 * - 既存の localStorage データがあれば自動マイグレーション
 */
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { MonthlySchedulePlan, Staff, ShiftAssignment, ShiftRequest, DayEvent, ShiftTypeId } from '../types/shift';

const DB_NAME = 'shift_auto_creator_db';
const IDB_STORE = 'sqlite_db_store';
const IDB_KEY = 'main_db';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let initPromise: Promise<void> | null = null;

// ─── IndexedDB ヘルパー ───────────────────────────────
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadDbBytesFromIDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveDbBytesToIDB(bytes: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── スキーマ定義 ──────────────────────────────────
function createTables(d: Database): void {
  d.run(`
    CREATE TABLE IF NOT EXISTS plans (
      year_month TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_monthly_hours REAL,
      rules_json TEXT NOT NULL,
      shift_types_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      can_night_shift INTEGER NOT NULL DEFAULT 0,
      monthly_max_hours REAL NOT NULL DEFAULT 168,
      weekly_max_hours REAL,
      min_holidays_per_month INTEGER NOT NULL DEFAULT 9,
      skill_level INTEGER NOT NULL DEFAULT 3,
      ng_staff_ids_json TEXT NOT NULL DEFAULT '[]',
      preferred_shift_types_json TEXT,
      fixed_shift_type TEXT,
      fixed_day_shifts_json TEXT,
      allowed_weekly_work_days_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      staff_id TEXT NOT NULL,
      date TEXT NOT NULL,
      year_month TEXT NOT NULL,
      shift_type_id TEXT NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0,
      is_requested INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (staff_id, date)
    );
  `);

  // requests テーブルのマイグレーションチェック（旧スキーマ: id 単独 PRIMARY KEY の救済）
  try {
    const res = d.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='requests';");
    if (res.length > 0 && res[0].values.length > 0) {
      const createSql = (res[0].values[0][0] as string) || '';
      if (createSql.includes('id TEXT PRIMARY KEY')) {
        d.run('ALTER TABLE requests RENAME TO requests_old;');
        d.run(`
          CREATE TABLE requests (
            id TEXT NOT NULL,
            staff_id TEXT NOT NULL,
            date TEXT NOT NULL,
            year_month TEXT NOT NULL,
            requested_shift_id TEXT NOT NULL,
            is_priority INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            PRIMARY KEY (year_month, id)
          );
        `);
        d.run(`
          INSERT OR IGNORE INTO requests (id, staff_id, date, year_month, requested_shift_id, is_priority, note)
          SELECT id, staff_id, date, year_month, requested_shift_id, is_priority, note FROM requests_old;
        `);
        d.run('DROP TABLE requests_old;');
      }
    }
  } catch (err) {
    console.warn('[SQLite] requests schema migration:', err);
  }

  d.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      date TEXT NOT NULL,
      year_month TEXT NOT NULL,
      requested_shift_id TEXT NOT NULL,
      is_priority INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      PRIMARY KEY (year_month, id)
    );
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS events (
      date TEXT NOT NULL,
      year_month TEXT NOT NULL,
      title TEXT NOT NULL,
      color TEXT,
      notes TEXT,
      PRIMARY KEY (year_month, date)
    );
  `);
}

// ─── 初期化 ────────────────────────────────────────
export async function initDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    SQL = await initSqlJs({
      locateFile: () => sqlWasmUrl,
    });

    const existingBytes = await loadDbBytesFromIDB();
    if (existingBytes) {
      db = new SQL.Database(existingBytes);
    } else {
      db = new SQL.Database();
    }

    createTables(db);
    await persistDb();
  })();

  return initPromise;
}

async function persistDb(): Promise<void> {
  if (!db) return;
  const bytes = db.export();
  await saveDbBytesToIDB(new Uint8Array(bytes));
}

function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ─── Plan CRUD ─────────────────────────────────────
export async function savePlan(plan: MonthlySchedulePlan): Promise<void> {
  const d = getDb();

  d.run('BEGIN TRANSACTION;');
  try {
    // 1. プラン本体（rules, shiftTypes は JSON 列で保持）
    d.run(
      `INSERT OR REPLACE INTO plans (year_month, id, name, target_monthly_hours, rules_json, shift_types_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        plan.yearMonth,
        plan.id,
        plan.name,
        plan.targetMonthlyHours ?? null,
        JSON.stringify(plan.rules),
        JSON.stringify(plan.shiftTypes),
        plan.updatedAt,
      ]
    );

    // 2. スタッフ
    plan.staffList.forEach((s, idx) => {
      d.run(
        `INSERT OR REPLACE INTO staff (id, name, role, employment_type, can_night_shift, monthly_max_hours,
         weekly_max_hours, min_holidays_per_month, skill_level, ng_staff_ids_json, preferred_shift_types_json,
         fixed_shift_type, fixed_day_shifts_json, allowed_weekly_work_days_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          s.id, s.name, s.role, s.employmentType,
          s.canNightShift ? 1 : 0, s.monthlyMaxHours,
          s.weeklyMaxHours ?? null, s.minHolidaysPerMonth,
          s.skillLevel, JSON.stringify(s.ngStaffIds),
          s.preferredShiftTypes ? JSON.stringify(s.preferredShiftTypes) : null,
          s.fixedShiftType ?? null,
          s.fixedDayShifts ? JSON.stringify(s.fixedDayShifts) : null,
          s.allowedWeeklyWorkDays ? JSON.stringify(s.allowedWeeklyWorkDays) : null,
          idx,
        ]
      );
    });

    // 3. 割り当て（当月分を差し替え）
    d.run('DELETE FROM assignments WHERE year_month = ?;', [plan.yearMonth]);
    Object.values(plan.assignments).forEach((a) => {
      d.run(
        `INSERT INTO assignments (staff_id, date, year_month, shift_type_id, is_locked, is_requested)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [a.staffId, a.date, plan.yearMonth, a.shiftTypeId, a.isLocked ? 1 : 0, a.isRequested ? 1 : 0]
      );
    });

    // 4. リクエスト（当月分を差し替え）
    d.run('DELETE FROM requests WHERE year_month = ?;', [plan.yearMonth]);
    plan.requests.forEach((r, idx) => {
      const reqId = r.id || `req_${plan.yearMonth}_${idx}`;
      d.run(
        `INSERT OR REPLACE INTO requests (id, staff_id, date, year_month, requested_shift_id, is_priority, note)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [reqId, r.staffId, r.date, plan.yearMonth, r.requestedShiftId, r.isPriority ? 1 : 0, r.note ?? null]
      );
    });

    // 5. イベント（当月分を差し替え）
    d.run('DELETE FROM events WHERE year_month = ?;', [plan.yearMonth]);
    Object.values(plan.events).forEach((e) => {
      d.run(
        `INSERT OR REPLACE INTO events (date, year_month, title, color, notes)
         VALUES (?, ?, ?, ?, ?);`,
        [e.date, plan.yearMonth, e.title, e.color ?? null, e.notes ?? null]
      );
    });

    d.run('COMMIT;');
  } catch (err) {
    d.run('ROLLBACK;');
    throw err;
  }

  await persistDb();
}

export async function savePlans(plans: Record<string, MonthlySchedulePlan>): Promise<void> {
  for (const plan of Object.values(plans)) {
    await savePlan(plan);
  }
}

export function loadPlans(): Record<string, MonthlySchedulePlan> {
  const d = getDb();
  const result: Record<string, MonthlySchedulePlan> = {};

  const planRows = d.exec('SELECT * FROM plans ORDER BY year_month;');
  if (!planRows.length || !planRows[0].values.length) return result;

  const cols = planRows[0].columns;
  for (const row of planRows[0].values) {
    const get = (col: string) => row[cols.indexOf(col)];
    const yearMonth = get('year_month') as string;

    // スタッフ
    const staffList: Staff[] = [];
    const staffRows = d.exec('SELECT * FROM staff ORDER BY sort_order;');
    if (staffRows.length && staffRows[0].values.length) {
      const sCols = staffRows[0].columns;
      for (const sRow of staffRows[0].values) {
        const sGet = (col: string) => sRow[sCols.indexOf(col)];
        staffList.push({
          id: sGet('id') as string,
          name: sGet('name') as string,
          role: sGet('role') as string,
          employmentType: sGet('employment_type') as Staff['employmentType'],
          canNightShift: (sGet('can_night_shift') as number) === 1,
          monthlyMaxHours: sGet('monthly_max_hours') as number,
          weeklyMaxHours: sGet('weekly_max_hours') as number | undefined,
          minHolidaysPerMonth: sGet('min_holidays_per_month') as number,
          skillLevel: sGet('skill_level') as Staff['skillLevel'],
          ngStaffIds: JSON.parse(sGet('ng_staff_ids_json') as string),
          preferredShiftTypes: sGet('preferred_shift_types_json')
            ? JSON.parse(sGet('preferred_shift_types_json') as string)
            : undefined,
          fixedShiftType: (sGet('fixed_shift_type') as ShiftTypeId) || undefined,
          fixedDayShifts: sGet('fixed_day_shifts_json')
            ? JSON.parse(sGet('fixed_day_shifts_json') as string)
            : undefined,
          allowedWeeklyWorkDays: sGet('allowed_weekly_work_days_json')
            ? JSON.parse(sGet('allowed_weekly_work_days_json') as string)
            : undefined,
        });
      }
    }

    // 割り当て
    const assignments: Record<string, ShiftAssignment> = {};
    const aRows = d.exec('SELECT * FROM assignments WHERE year_month = ?;', [yearMonth]);
    if (aRows.length && aRows[0].values.length) {
      const aCols = aRows[0].columns;
      for (const aRow of aRows[0].values) {
        const aGet = (col: string) => aRow[aCols.indexOf(col)];
        const staffId = aGet('staff_id') as string;
        const date = aGet('date') as string;
        const key = `${staffId}_${date}`;
        assignments[key] = {
          staffId,
          date,
          shiftTypeId: aGet('shift_type_id') as ShiftTypeId,
          isLocked: (aGet('is_locked') as number) === 1,
          isRequested: (aGet('is_requested') as number) === 1,
        };
      }
    }

    // リクエスト
    const requests: ShiftRequest[] = [];
    const rRows = d.exec('SELECT * FROM requests WHERE year_month = ?;', [yearMonth]);
    if (rRows.length && rRows[0].values.length) {
      const rCols = rRows[0].columns;
      for (const rRow of rRows[0].values) {
        const rGet = (col: string) => rRow[rCols.indexOf(col)];
        requests.push({
          id: rGet('id') as string,
          staffId: rGet('staff_id') as string,
          date: rGet('date') as string,
          requestedShiftId: rGet('requested_shift_id') as ShiftTypeId,
          isPriority: (rGet('is_priority') as number) === 1,
          note: rGet('note') as string | undefined,
        });
      }
    }

    // イベント
    const events: Record<string, DayEvent> = {};
    const eRows = d.exec('SELECT * FROM events WHERE year_month = ?;', [yearMonth]);
    if (eRows.length && eRows[0].values.length) {
      const eCols = eRows[0].columns;
      for (const eRow of eRows[0].values) {
        const eGet = (col: string) => eRow[eCols.indexOf(col)];
        const date = eGet('date') as string;
        events[date] = {
          date,
          title: eGet('title') as string,
          color: (eGet('color') as string) || undefined,
          notes: (eGet('notes') as string) || undefined,
        };
      }
    }

    result[yearMonth] = {
      id: get('id') as string,
      yearMonth,
      name: get('name') as string,
      targetMonthlyHours: get('target_monthly_hours') as number | undefined,
      staffList,
      shiftTypes: JSON.parse(get('shift_types_json') as string),
      assignments,
      dailyRequirements: {},
      requests,
      events,
      rules: JSON.parse(get('rules_json') as string),
      updatedAt: get('updated_at') as string,
    };
  }

  return result;
}

// ─── localStorage → SQLite マイグレーション ───────────
export async function migrateFromLocalStorage(): Promise<boolean> {
  const PLANS_KEY = 'SHIFT_AUTO_CREATOR_PLANS_V1';
  const SINGLE_KEY = 'SHIFT_AUTO_CREATOR_PLAN_V1';

  let plans: Record<string, MonthlySchedulePlan> | null = null;

  try {
    const rawPlans = localStorage.getItem(PLANS_KEY);
    if (rawPlans) {
      const parsed = JSON.parse(rawPlans);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        plans = parsed;
      }
    }
    if (!plans) {
      const rawSingle = localStorage.getItem(SINGLE_KEY);
      if (rawSingle) {
        const single = JSON.parse(rawSingle) as MonthlySchedulePlan;
        plans = { [single.yearMonth]: single };
      }
    }
  } catch {
    return false;
  }

  if (!plans || Object.keys(plans).length === 0) return false;

  await savePlans(plans);

  // マイグレーション成功後に localStorage を消去
  localStorage.removeItem(PLANS_KEY);
  localStorage.removeItem(SINGLE_KEY);
  console.log('[SQLite] localStorage → SQLite マイグレーション完了');
  return true;
}
