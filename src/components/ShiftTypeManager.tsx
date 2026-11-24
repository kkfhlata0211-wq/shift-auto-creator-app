import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ShiftType, ShiftTypeId } from '../types/shift';
import {
  CUSTOM_SHIFT_COLOR_PRESETS,
  getShiftColorPresentation,
  getShiftTypeColorPresentation,
} from '../utils/shiftColors';
import { getOrderedShiftTypes } from '../utils/shiftTypeOrder';

const BUILT_IN_SHIFT_IDS = new Set([
  'DAY',
  'EARLY',
  'LATE',
  'NIGHT',
  'NIGHT_NEXT',
  'HOLIDAY',
  'PAID_LEAVE',
]);
const VISIBLE_BUILT_IN_SHIFT_IDS = new Set(['DAY', 'EARLY', 'LATE', 'NIGHT']);

interface ShiftTypeManagerProps {
  shiftTypes: Record<ShiftTypeId, ShiftType>;
  onChange: (shiftTypes: Record<ShiftTypeId, ShiftType>) => void;
}

const emptyShiftType = (): ShiftType => ({
  id: '',
  name: '',
  shortName: '',
  startTime: '09:00',
  endTime: '18:00',
  workHours: 8,
  fteWeight: 1,
  color: '#3b82f6',
  textColor: '#1e40af',
  isWork: true,
  isNight: false,
  requiredStaff: 0,
});

export const ShiftTypeManager: React.FC<ShiftTypeManagerProps> = ({ shiftTypes, onChange }) => {
  const [form, setForm] = useState<ShiftType | null>(null);
  const [editingId, setEditingId] = useState<ShiftTypeId | null>(null);
  const orderedShiftTypes = getOrderedShiftTypes(shiftTypes);

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyShiftType());
  };

  const startEdit = (shiftType: ShiftType) => {
    setEditingId(shiftType.id);
    setForm({ ...shiftType });
  };

  const save = () => {
    if (!form) return;
    if (!form.name.trim() || !form.shortName.trim()) {
      alert('区分名と略称を入力してください。');
      return;
    }
    if (form.isWork && (!Number.isFinite(form.workHours) || form.workHours <= 0 || form.workHours > 24)) {
      alert('勤務時間は0より大きく24以下で入力してください。');
      return;
    }
    const duplicate = Object.values(shiftTypes).some(
      (shiftType) =>
        shiftType.id !== editingId &&
        (shiftType.name.trim() === form.name.trim() || shiftType.shortName.trim() === form.shortName.trim())
    );
    if (duplicate) {
      alert('区分名または略称が既存の区分と重複しています。');
      return;
    }

    const id = editingId || `CUSTOM_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const saved: ShiftType = {
      ...form,
      id,
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      textColor: getShiftColorPresentation(form.color, form.textColor).style?.color || form.textColor,
      workHours: form.isWork ? form.workHours : 0,
      fteWeight: form.isWork ? form.workHours / 8 : 0,
      isNight: false,
      requiredStaff: form.isWork ? Math.max(0, Math.floor(form.requiredStaff ?? 0)) : 0,
    };
    const nextShiftTypes = { ...shiftTypes, [id]: saved };
    const nextOrder = getOrderedShiftTypes(nextShiftTypes);
    const orderedMap: Record<ShiftTypeId, ShiftType> = {};
    nextOrder.forEach((shiftType, index) => {
      orderedMap[shiftType.id] = { ...shiftType, displayOrder: index };
    });
    onChange(orderedMap);
    setForm(null);
  };

  const remove = (shiftType: ShiftType) => {
    if (!window.confirm(`「${shiftType.name}」を削除しますか？この区分を使った割当・希望・担当設定も削除されます。`)) return;
    const next = { ...shiftTypes };
    delete next[shiftType.id];
    onChange(next);
    if (editingId === shiftType.id) setForm(null);
  };

  const visibleShiftTypes = orderedShiftTypes.filter(
    (shiftType) =>
      !BUILT_IN_SHIFT_IDS.has(shiftType.id) || VISIBLE_BUILT_IN_SHIFT_IDS.has(shiftType.id)
  );
  const moveShiftType = (id: ShiftTypeId, direction: -1 | 1) => {
    const currentIndex = orderedShiftTypes.findIndex((shiftType) => shiftType.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedShiftTypes.length) return;

    const reordered = [...orderedShiftTypes];
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    const nextShiftTypes: Record<ShiftTypeId, ShiftType> = {};
    reordered.forEach((shiftType, index) => {
      nextShiftTypes[shiftType.id] = { ...shiftType, displayOrder: index };
    });
    onChange(nextShiftTypes);
  };
  const updateDisplayField = (id: ShiftTypeId, field: 'name' | 'shortName', value: string) => {
    onChange({
      ...shiftTypes,
      [id]: { ...shiftTypes[id], [field]: value },
    });
  };
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
        <h3 className="text-sm font-bold text-slate-800">勤務区分の表示名・略称</h3>
        <p className="text-[11px] text-slate-500 mt-1">内部IDや勤務ルールは変えず、表示名・略称を編集できます。</p>
        </div>
        {!form && (
          <button type="button" onClick={startAdd} className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> 区分を追加
          </button>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <h4 className="text-xs font-bold text-slate-700">シフト区分の表示順</h4>
          <p className="mt-1 text-[10px] text-slate-500">
            ↑↓で変更できます。シフト表の集計行・集計列にも反映されます。
          </p>
        </div>
        <ol className="max-h-48 space-y-1 overflow-y-auto">
          {orderedShiftTypes.map((shiftType, index) => {
            const color = getShiftTypeColorPresentation(shiftType);
            return (
              <li
                key={`order_${shiftType.id}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
              >
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[10px] font-bold ${color.className}`}
                  style={color.style}
                >
                  {shiftType.shortName}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
                  {shiftType.name}
                </span>
                <button
                  type="button"
                  onClick={() => moveShiftType(shiftType.id, -1)}
                  disabled={index === 0}
                  aria-label={`${shiftType.name}を上へ移動`}
                  title="上へ移動"
                  className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveShiftType(shiftType.id, 1)}
                  disabled={index === orderedShiftTypes.length - 1}
                  aria-label={`${shiftType.name}を下へ移動`}
                  title="下へ移動"
                  className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
        {visibleShiftTypes.map((shiftType) => {
          const isCustom = !BUILT_IN_SHIFT_IDS.has(shiftType.id);
          const color = getShiftTypeColorPresentation(shiftType);
          return (
            <div key={shiftType.id} className="space-y-1.5">
              <div
                className={`space-y-2 rounded-xl border p-3 ${color.className}`}
                style={color.style}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex min-w-7 h-7 items-center justify-center rounded px-1 text-xs font-black"
                    style={color.style
                      ? color.style
                      : { backgroundColor: 'rgba(255,255,255,0.8)', color: '#1e293b' }}
                  >
                    {shiftType.shortName}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{shiftType.name}</span>
                  {isCustom && (
                    <>
                      <button type="button" onClick={() => startEdit(shiftType)} aria-label={`${shiftType.name}の勤務設定を編集`} className="rounded p-1.5 text-slate-600 hover:bg-white/70">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => remove(shiftType)} aria-label={`${shiftType.name}を削除`} className="rounded p-1.5 text-rose-700 hover:bg-white/70">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
                <label className="block text-[10px] font-semibold">
                  区分名
                  <input
                    value={shiftType.name}
                    maxLength={24}
                    onChange={(event) => updateDisplayField(shiftType.id, 'name', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800"
                  />
                </label>
                <label className="block text-[10px] font-semibold">
                  略称
                  <input
                    value={shiftType.shortName}
                    maxLength={3}
                    onChange={(event) => updateDisplayField(shiftType.id, 'shortName', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800"
                  />
                </label>
              </div>
              {shiftType.id === 'NIGHT' && (
                <p className="px-1 text-[10px] font-semibold leading-relaxed text-red-600">
                  ※ 夜勤専用枠です。日中帯のシフトとして使用不可
                </p>
              )}
            </div>
          );
        })}
      </div>

      {form && (
        <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800">{editingId ? '区分を編集' : '新しい区分'}</h4>
            <button type="button" onClick={() => setForm(null)} aria-label="編集をキャンセル" className="rounded p-1 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="block font-semibold">区分名 *</span>
              <input value={form.name} maxLength={24} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例: 中番・研修" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="block font-semibold">略称 *</span>
              <input value={form.shortName} maxLength={3} onChange={(event) => setForm({ ...form, shortName: event.target.value })} placeholder="例: 中" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={form.isWork} onChange={(event) => setForm({ ...form, isWork: event.target.checked })} />
              出勤扱いにする
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <span>表示色</span>
              <input type="color" value={form.color.startsWith('#') ? form.color : '#3b82f6'} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white p-1" />
            </label>
            <div className="col-span-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold">色の候補</span>
              {CUSTOM_SHIFT_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  aria-label={`${preset.label}色を選択`}
                  title={preset.label}
                  onClick={() => setForm({ ...form, color: preset.value })}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
                    form.color.toLowerCase() === preset.value ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                  }`}
                  style={getShiftColorPresentation(preset.value, form.textColor).style}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.value }} />
                </button>
              ))}
            </div>
            {form.isWork && (
              <>
                <label className="space-y-1">
                  <span className="block font-semibold">開始時刻</span>
                  <input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                </label>
                <label className="space-y-1">
                  <span className="block font-semibold">終了時刻</span>
                  <input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                </label>
                <label className="space-y-1">
                  <span className="block font-semibold">実働時間 (h)</span>
                  <input type="number" min={0.5} max={24} step={0.5} value={form.workHours} onChange={(event) => setForm({ ...form, workHours: Number(event.target.value) })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                </label>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200">キャンセル</button>
            <button type="button" onClick={save} className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Check className="h-4 w-4" />保存</button>
          </div>
        </div>
      )}
    </section>
  );
};
