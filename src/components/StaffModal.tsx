import React, { useState } from 'react';
import { X, UserPlus, Trash2, Edit2, Check, Moon, Star, Users, Calendar } from 'lucide-react';
import { Staff, EmploymentType, ShiftTypeId } from '../types/shift';

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: Staff[];
  onUpdateStaffList: (newStaffList: Staff[]) => void;
}

export const StaffModal: React.FC<StaffModalProps> = ({
  isOpen,
  onClose,
  staffList,
  onUpdateStaffList,
}) => {
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // 編集/追加用フォーム状態
  const [formData, setFormData] = useState<Staff>({
    id: '',
    name: '',
    role: '介護福祉士',
    employmentType: 'FULL_TIME',
    canNightShift: true,
    monthlyMaxHours: 168,
    minHolidaysPerMonth: 9,
    skillLevel: 3,
    ngStaffIds: [],
  });

  if (!isOpen) return null;

  const handleStartEdit = (staff: Staff) => {
    setEditingStaffId(staff.id);
    setFormData({ ...staff });
    setIsAdding(false);
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingStaffId(null);
    setFormData({
      id: `st_${Date.now()}`,
      name: '',
      role: '看護師',
      employmentType: 'FULL_TIME',
      canNightShift: false,
      monthlyMaxHours: 168,
      weeklyMaxHours: 40,
      minHolidaysPerMonth: 9,
      skillLevel: 3,
      ngStaffIds: [],
      fixedDayShifts: {},
      allowedWeeklyWorkDays: [3, 4],
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('スタッフ氏名を入力してください。');
      return;
    }

    if (isAdding) {
      onUpdateStaffList([...staffList, formData]);
      setIsAdding(false);
    } else if (editingStaffId) {
      onUpdateStaffList(
        staffList.map((s) => (s.id === editingStaffId ? formData : s))
      );
      setEditingStaffId(null);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`「${name}」を削除しますか？`)) {
      onUpdateStaffList(staffList.filter((s) => s.id !== id));
      if (editingStaffId === id) setEditingStaffId(null);
    }
  };

  const toggleNgStaff = (targetStaffId: string) => {
    const current = formData.ngStaffIds || [];
    if (current.includes(targetStaffId)) {
      setFormData({
        ...formData,
        ngStaffIds: current.filter((id) => id !== targetStaffId),
      });
    } else {
      setFormData({
        ...formData,
        ngStaffIds: [...current, targetStaffId],
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* モーダルヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">スタッフ管理・スキル・NGペア設定</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* モーダルコンテンツ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 上部: 新規追加ボタン */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500">
              合計: <strong className="text-slate-800">{staffList.length}名</strong>（正社員・パート）
            </span>
            {!isAdding && !editingStaffId && (
              <button
                onClick={handleStartAdd}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>新規スタッフ追加</span>
              </button>
            )}
          </div>

          {/* 編集 / 追加 フォーム */}
          {(isAdding || editingStaffId) && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                <h3 className="text-sm font-bold text-blue-900">
                  {isAdding ? '新規スタッフの登録' : `${formData.name} の設定編集`}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsAdding(false);
                      setEditingStaffId(null);
                    }}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>保存する</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">氏名 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例: 佐藤 健一"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">役職・職種</label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="例: 看護師, 介護福祉士"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">雇用形態</label>
                  <select
                    value={formData.employmentType}
                    onChange={(e) => {
                      const newType = e.target.value as EmploymentType;
                      setFormData({
                        ...formData,
                        employmentType: newType,
                        monthlyMaxHours: newType === 'FULL_TIME' ? 168 : 120,
                        weeklyMaxHours: newType === 'PART_TIME' ? 40 : undefined,
                      });
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="FULL_TIME">正社員 (常勤)</option>
                    <option value="PART_TIME">パート (週上限管理)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">スキル評価 (1〜5)</label>
                  <select
                    value={formData.skillLevel}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        skillLevel: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
                      })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={1}>★☆☆☆☆ (新人・研修)</option>
                    <option value={2}>★★☆☆☆ (初級)</option>
                    <option value={3}>★★★☆☆ (標準・単独可)</option>
                    <option value={4}>★★★★☆ (中堅・リーダー)</option>
                    <option value={5}>★★★★★ (師長・ベテラン)</option>
                  </select>
                </div>

                {formData.employmentType === 'PART_TIME' ? (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      週間上限労働時間 (h) <span className="text-blue-600 font-normal">※最大40h</span>
                    </label>
                    <input
                      type="number"
                      max={40}
                      min={1}
                      value={formData.weeklyMaxHours ?? 40}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          weeklyMaxHours: Math.min(40, Number(e.target.value)),
                        })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-blue-700"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">月間上限労働時間 (h)</label>
                    <input
                      type="number"
                      value={formData.monthlyMaxHours}
                      onChange={(e) =>
                        setFormData({ ...formData, monthlyMaxHours: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">月間最低公休日数</label>
                  <input
                    type="number"
                    value={formData.minHolidaysPerMonth}
                    onChange={(e) =>
                      setFormData({ ...formData, minHolidaysPerMonth: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="col-span-3 flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.canNightShift}
                      onChange={(e) =>
                        setFormData({ ...formData, canNightShift: e.target.checked })
                      }
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <Moon className="w-4 h-4 text-purple-600" />
                    <span>夜勤シフトに入ることができる</span>
                  </label>
                </div>

                {/* パート専用設定: 週勤務日数 & 曜日固定シフト */}
                {formData.employmentType === 'PART_TIME' && (
                  <>
                    {/* 週の勤務日数（複数選択可） */}
                    <div className="col-span-3 pt-3 border-t border-blue-100">
                      <label className="block text-slate-700 font-semibold mb-1">
                        週の希望勤務日数（複数選択可）
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 6].map((num) => {
                          const isSelected = (formData.allowedWeeklyWorkDays || []).includes(num);
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => {
                                const current = formData.allowedWeeklyWorkDays || [];
                                const updated = isSelected
                                  ? current.filter((n) => n !== num)
                                  : [...current, num].sort();
                                setFormData({ ...formData, allowedWeeklyWorkDays: updated });
                              }}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-1 ring-blue-400'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              週{num}日
                            </button>
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        ※ 複数選択可能です（例:「週3日」と「週4日」を選択した場合は週3〜4日勤務）
                      </span>
                    </div>

                    {/* 曜日固定シフト設定 */}
                    <div className="col-span-3 pt-2">
                      <div className="flex items-center gap-1.5 mb-1.5 font-semibold text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>曜日固定シフト（パート専用）</span>
                      </div>
                      <div className="grid grid-cols-7 gap-2 bg-white p-3 rounded-xl border border-slate-200">
                        {[
                          { idx: 1, name: '月' },
                          { idx: 2, name: '火' },
                          { idx: 3, name: '水' },
                          { idx: 4, name: '木' },
                          { idx: 5, name: '金' },
                          { idx: 6, name: '土', isSat: true },
                          { idx: 0, name: '日', isSun: true },
                        ].map((dow) => {
                          const currentShift = formData.fixedDayShifts?.[dow.idx];
                          return (
                            <div key={dow.idx} className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center">
                              <div
                                className={`font-bold text-xs mb-1 ${
                                  dow.isSun ? 'text-rose-600' : dow.isSat ? 'text-blue-600' : 'text-slate-700'
                                }`}
                              >
                                {dow.name}曜日
                              </div>
                              <select
                                value={currentShift || ''}
                                onChange={(e) => {
                                  const val = e.target.value as ShiftTypeId | '';
                                  const updated = { ...(formData.fixedDayShifts || {}) };
                                  if (val) {
                                    updated[dow.idx] = val;
                                  } else {
                                    delete updated[dow.idx];
                                  }
                                  setFormData({ ...formData, fixedDayShifts: updated });
                                }}
                                className="w-full text-xs py-1 px-1 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-semibold bg-white"
                              >
                                <option value="">指定なし</option>
                                <option value="DAY">日勤</option>
                                <option value="EARLY">早番</option>
                                <option value="LATE">遅番</option>
                                <option value="HOLIDAY">休 (固定)</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        ※ 曜日ごとに固定勤務または固定休日を設定できます。自動作成時も固定シフトが優先されます。
                      </span>
                    </div>
                  </>
                )}

                {/* NGペア設定 */}
                <div className="col-span-3 pt-2">
                  <label className="block text-slate-700 font-semibold mb-1">
                    NGペア（同じシフトに入れないスタッフを選択）
                  </label>
                  <div className="grid grid-cols-4 gap-2 bg-white p-3 rounded-lg border border-slate-200 max-h-36 overflow-y-auto">
                    {staffList
                      .filter((s) => s.id !== formData.id)
                      .map((other) => {
                        const isNg = formData.ngStaffIds?.includes(other.id);
                        return (
                          <label
                            key={other.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                              isNg
                                ? 'bg-rose-50 border-rose-300 text-rose-800 font-semibold'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isNg}
                              onChange={() => toggleNgStaff(other.id)}
                              className="w-3.5 h-3.5 text-rose-600 rounded"
                            />
                            <span>{other.name}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* スタッフ一覧テーブル */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                <tr>
                  <th className="px-4 py-3">氏名</th>
                  <th className="px-3 py-3">役職 / 雇用</th>
                  <th className="px-3 py-3 text-center">スキル</th>
                  <th className="px-3 py-3 text-center">夜勤</th>
                  <th className="px-3 py-3 text-center">上限労働時間</th>
                  <th className="px-3 py-3">NGペア</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((staff) => {
                  const ngNames = (staff.ngStaffIds || [])
                    .map((id) => staffList.find((s) => s.id === id)?.name)
                    .filter(Boolean);

                  return (
                    <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {staff.name}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <div>{staff.role}</div>
                        <div className="text-[10px] text-slate-400">
                          {staff.employmentType === 'FULL_TIME' ? '正社員' : 'パート'}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          {Array.from({ length: staff.skillLevel }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {staff.canNightShift ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">
                            夜勤可
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-slate-700">
                        {staff.employmentType === 'PART_TIME' ? (
                          <div>
                            <span className="text-blue-700 font-bold">週 {staff.weeklyMaxHours ?? 40}h</span>
                            {staff.allowedWeeklyWorkDays && staff.allowedWeeklyWorkDays.length > 0 && (
                              <div className="text-[10px] text-blue-600 font-semibold mt-0.5">
                                週{staff.allowedWeeklyWorkDays.sort().join('・')}日
                              </div>
                            )}
                          </div>
                        ) : (
                          <span>月 {staff.monthlyMaxHours}h</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {ngNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {ngNames.map((name, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-semibold"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">なし</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleStartEdit(staff)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="編集"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(staff.id, staff.name)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* モーダルフッター */}
        <div className="px-6 py-3 border-t border-slate-200 flex justify-end bg-slate-50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
