import React, { useEffect, useRef, useState } from 'react';
import { Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
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
  const [isReordering, setIsReordering] = useState(false);
  const [draggedShiftTypeId, setDraggedShiftTypeId] = useState<ShiftTypeId | null>(null);
  const [dropTargetId, setDropTargetId] = useState<ShiftTypeId | null>(null);
  const orderedShiftTypes = getOrderedShiftTypes(shiftTypes);
  const pointerPressRef = useRef<{
    id: ShiftTypeId;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const dragTimerRef = useRef<number | null>(null);
  const dropTargetRef = useRef<ShiftTypeId | null>(null);
  const originalOrderRef = useRef<ShiftTypeId[] | null>(null);

  useEffect(
    () => () => {
      if (dragTimerRef.current !== null) window.clearTimeout(dragTimerRef.current);
    },
    []
  );

  const clearPointerDrag = () => {
    if (dragTimerRef.current !== null) {
      window.clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    pointerPressRef.current = null;
    dropTargetRef.current = null;
    setDraggedShiftTypeId(null);
    setDropTargetId(null);
  };

  const saveOrder = (reordered: ShiftType[]) => {
    const nextShiftTypes: Record<ShiftTypeId, ShiftType> = {};
    reordered.forEach((shiftType, index) => {
      nextShiftTypes[shiftType.id] = { ...shiftType, displayOrder: index };
    });
    onChange(nextShiftTypes);
  };

  const moveToPosition = (id: ShiftTypeId, targetId: ShiftTypeId) => {
    const fromIndex = orderedShiftTypes.findIndex((shiftType) => shiftType.id === id);
    const toIndex = orderedShiftTypes.findIndex((shiftType) => shiftType.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const reordered = [...orderedShiftTypes];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    saveOrder(reordered);
  };

  const startReordering = () => {
    originalOrderRef.current = orderedShiftTypes.map((shiftType) => shiftType.id);
    setIsReordering(true);
  };

  const finishReordering = () => {
    originalOrderRef.current = null;
    clearPointerDrag();
    setIsReordering(false);
  };

  const cancelReordering = () => {
    const originalOrder = originalOrderRef.current;
    if (originalOrder) {
      const shiftTypesById = new Map(orderedShiftTypes.map((shiftType) => [shiftType.id, shiftType]));
      const restored = originalOrder
        .map((id) => shiftTypesById.get(id))
        .filter((shiftType): shiftType is ShiftType => Boolean(shiftType));
      saveOrder(restored);
    }
    finishReordering();
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    shiftTypeId: ShiftTypeId
  ) => {
    if (!isReordering || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerPressRef.current = {
      id: shiftTypeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    dragTimerRef.current = window.setTimeout(() => {
      const press = pointerPressRef.current;
      if (press?.pointerId !== event.pointerId) return;
      press.active = true;
      dropTargetRef.current = shiftTypeId;
      setDraggedShiftTypeId(shiftTypeId);
      setDropTargetId(shiftTypeId);
    }, 280);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = pointerPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (!press.active) {
      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 10) {
        clearPointerDrag();
      }
      return;
    }
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-shift-order-id]');
    const targetId = target?.dataset.shiftOrderId;
    if (targetId) {
      dropTargetRef.current = targetId;
      setDropTargetId(targetId);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = pointerPressRef.current;
    if (press?.pointerId === event.pointerId && press.active) {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-shift-order-id]');
      const targetId = target?.dataset.shiftOrderId || dropTargetRef.current;
      if (targetId) moveToPosition(press.id, targetId);
    }
    clearPointerDrag();
  };

  const handlePointerCancel = () => clearPointerDrag();

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
    const existingShiftType = editingId ? shiftTypes[editingId] : undefined;
    const isBuiltIn = Boolean(editingId && BUILT_IN_SHIFT_IDS.has(editingId));
    const isWork = isBuiltIn ? existingShiftType?.isWork ?? form.isWork : form.isWork;
    const saved: ShiftType = {
      ...form,
      id,
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      textColor: getShiftColorPresentation(form.color, form.textColor).style?.color || form.textColor,
      isWork,
      workHours: isWork ? form.workHours : 0,
      fteWeight: isWork ? form.workHours / 8 : 0,
      isNight: isBuiltIn ? existingShiftType?.isNight ?? false : false,
      requiredStaff: isBuiltIn
        ? existingShiftType?.requiredStaff
        : isWork
          ? Math.max(0, Math.floor(form.requiredStaff ?? 0))
          : 0,
    };
    const nextShiftTypes = { ...shiftTypes, [id]: saved };
    const nextOrder = getOrderedShiftTypes(nextShiftTypes);
    saveOrder(nextOrder);
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
  const isEditingBuiltIn = Boolean(editingId && BUILT_IN_SHIFT_IDS.has(editingId));
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
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {isReordering ? (
              <>
                <button
                  type="button"
                  onClick={cancelReordering}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={finishReordering}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  完了
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startReordering}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  シフトの順番を変更
                </button>
                <button
                  type="button"
                  onClick={startAdd}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" /> 区分を追加
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isReordering ? (
        <div>
          <p className="mb-2 text-[11px] text-slate-500">
            カードを約0.3秒長押ししてからドラッグしてください。
          </p>
          <div
            className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {orderedShiftTypes.map((shiftType) => {
              const isDragging = draggedShiftTypeId === shiftType.id;
              const isDropTarget = dropTargetId === shiftType.id && !isDragging;
            const color = getShiftTypeColorPresentation(shiftType);
            return (
              <div
                key={`order_${shiftType.id}`}
                data-shift-order-id={shiftType.id}
                role="button"
                tabIndex={0}
                aria-label={`${shiftType.name}の並び替えカード`}
                onPointerDown={(event) => handlePointerDown(event, shiftType.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveToPosition(
                      shiftType.id,
                      orderedShiftTypes[
                        Math.max(
                          0,
                          Math.min(
                            orderedShiftTypes.length - 1,
                            orderedShiftTypes.findIndex((item) => item.id === shiftType.id) +
                              (event.key === 'ArrowUp' ? -1 : 1)
                          )
                        )
                      ].id
                    );
                  }
                }}
                onContextMenu={(event) => event.preventDefault()}
                className={`flex min-h-16 touch-none select-none items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                  color.className
                } ${
                  isDragging
                    ? 'z-10 -translate-y-1 scale-[1.03] cursor-grabbing opacity-70 shadow-xl ring-2 ring-blue-500'
                    : isDropTarget
                      ? 'border-blue-500 ring-2 ring-blue-300'
                      : 'cursor-grab hover:shadow-md'
                }`}
                style={color.style}
              >
                <GripVertical className="h-4 w-4 shrink-0 opacity-60" />
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded bg-white/80 px-1 text-xs font-black text-slate-800">
                  {shiftType.shortName}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-bold">
                  {shiftType.name}
                </span>
              </div>
            );
          })}
          </div>
        </div>
      ) : (
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
                  <button type="button" onClick={() => startEdit(shiftType)} aria-label={`${shiftType.name}の勤務設定を編集`} className="rounded p-1.5 text-slate-600 hover:bg-white/70">
                    <Pencil className="h-4 w-4" />
                  </button>
                  {isCustom && (
                    <>
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
      )}

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
            {!isEditingBuiltIn && (
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={form.isWork} onChange={(event) => setForm({ ...form, isWork: event.target.checked })} />
                出勤扱いにする
              </label>
            )}
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
