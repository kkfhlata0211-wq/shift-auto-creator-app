import React, { useState } from 'react';
import { X, Sliders, Check } from 'lucide-react';
import { ConstraintRules } from '../types/shift';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: ConstraintRules;
  onUpdateRules: (newRules: ConstraintRules) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  rules,
  onUpdateRules,
}) => {
  const [formRules, setFormRules] = useState<ConstraintRules>({ ...rules });

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateRules(formRules);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* モーダルヘッダー */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-800">制約ルール & 1日の必要人員設定</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 設定フォーム */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
          {/* セクション1: 労務・安全ルール */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-1.5">
              1. 労働基準法・労務安全ルール
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold mb-1">
                  連続勤務日数の上限（日）
                </label>
                <input
                  type="number"
                  min={2}
                  max={7}
                  value={formRules.maxConsecutiveWorkDays}
                  onChange={(e) =>
                    setFormRules({
                      ...formRules,
                      maxConsecutiveWorkDays: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg bg-white border-slate-300 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  ※ 有給休暇も出勤日数として扱い、連勤カウントはリセットされません
                </span>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  勤務間インターバル時間（時間）
                </label>
                <input
                  type="number"
                  min={8}
                  max={16}
                  value={formRules.minRestHoursBetweenShifts}
                  onChange={(e) =>
                    setFormRules({
                      ...formRules,
                      minRestHoursBetweenShifts: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg bg-white border-slate-300 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  遅番（20時退勤）翌日の早番（7時出勤）などの過密勤務を防止
                </span>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={formRules.enableNgPairCheck}
                  onChange={(e) =>
                    setFormRules({ ...formRules, enableNgPairCheck: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>NGペア制約（スタッフ同士の同一シフト同席禁止）を有効にする</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={formRules.balanceWeekendShifts}
                  onChange={(e) =>
                    setFormRules({ ...formRules, balanceWeekendShifts: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>土日祝の出勤回数をスタッフ間で公平に平準化する</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold">
                <input
                  type="checkbox"
                  checked={formRules.balanceNightShifts}
                  onChange={(e) =>
                    setFormRules({ ...formRules, balanceNightShifts: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>夜勤可能スタッフ間での夜勤回数を公平に平準化する</span>
              </label>
            </div>
          </div>

          {/* セクション2: 1日の必要スロット数・FTE要件 */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-1.5">
              2. 1日あたりの基準必要人数（シフト枠数）
            </h3>

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl">
                <label className="block font-bold text-amber-900 mb-1">早番 必要人数</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formRules.defaultRequirements?.EARLY ?? 1}
                  onChange={(e) =>
                    setFormRules({
                      ...formRules,
                      defaultRequirements: {
                        ...formRules.defaultRequirements,
                        EARLY: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-center font-bold"
                />
              </div>

              <div className="bg-blue-50/70 border border-blue-200 p-3 rounded-xl">
                <label className="block font-bold text-blue-900 mb-1">日勤 必要人数</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formRules.defaultRequirements?.DAY ?? 2}
                  onChange={(e) =>
                    setFormRules({
                      ...formRules,
                      defaultRequirements: {
                        ...formRules.defaultRequirements,
                        DAY: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-center font-bold"
                />
              </div>

              <div className="bg-orange-50/70 border border-orange-200 p-3 rounded-xl">
                <label className="block font-bold text-orange-900 mb-1">遅番 必要人数</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formRules.defaultRequirements?.LATE ?? 1}
                  onChange={(e) =>
                    setFormRules({
                      ...formRules,
                      defaultRequirements: {
                        ...formRules.defaultRequirements,
                        LATE: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white border border-orange-300 rounded-lg text-center font-bold"
                />
              </div>

              <div className="bg-purple-50/70 border border-purple-200 p-3 rounded-xl">
                <label className="block font-bold text-purple-900 mb-1">夜勤 必要人数</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formRules.defaultRequirements?.NIGHT ?? 1}
                  onChange={(e) =>
                    setFormRules({
                      ...formRules,
                      defaultRequirements: {
                        ...formRules.defaultRequirements,
                        NIGHT: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white border border-purple-300 rounded-lg text-center font-bold"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              ※ この設定値を下回った日は、マトリクス表下部フッターで「赤色ハイライト（警告）」が表示され、自動作成時にも優先して充足が試みられます。
            </p>
          </div>
        </div>

        {/* モーダルフッター */}
        <div className="px-6 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <Check className="w-4 h-4" />
            <span>設定を保存する</span>
          </button>
        </div>
      </div>
    </div>
  );
};
