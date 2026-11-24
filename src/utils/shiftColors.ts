export interface ShiftColorPresentation {
  className: string;
  style?: {
    backgroundColor: string;
    color: string;
    borderColor: string;
  };
}

export function getShiftTypeColorPresentation(shiftType: {
  id: string;
  color: string;
  textColor: string;
}): ShiftColorPresentation {
  if (shiftType.id === 'EARLY') {
    return { className: 'bg-lime-100 text-lime-800 border-lime-300' };
  }
  return getShiftColorPresentation(shiftType.color, shiftType.textColor);
}

export const CUSTOM_SHIFT_COLOR_PRESETS = [
  { label: '青', value: '#3b82f6' },
  { label: '水色', value: '#0ea5e9' },
  { label: '緑', value: '#10b981' },
  { label: '黄', value: '#f59e0b' },
  { label: '橙', value: '#f97316' },
  { label: '紫', value: '#8b5cf6' },
] as const;

const parseHexColor = (color: string): [number, number, number] | null => {
  const hex = color.slice(1);
  const normalized = hex.length === 3 ? hex.split('').map((digit) => `${digit}${digit}`).join('') : hex;
  if (!/^[\da-f]{6}$/i.test(normalized)) return null;

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const mix = (
  color: [number, number, number],
  target: [number, number, number],
  targetRatio: number
): [number, number, number] => [
  Math.round(color[0] * (1 - targetRatio) + target[0] * targetRatio),
  Math.round(color[1] * (1 - targetRatio) + target[1] * targetRatio),
  Math.round(color[2] * (1 - targetRatio) + target[2] * targetRatio),
];

const toHex = (color: [number, number, number]): string =>
  `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

export function getShiftColorPresentation(color: string, textColor: string): ShiftColorPresentation {
  if (!color.startsWith('#')) return { className: color };

  const rgb = parseHexColor(color);
  if (!rgb) {
    return {
      className: '',
      style: { backgroundColor: color, color: textColor, borderColor: color },
    };
  }

  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const background = mix(rgb, [255, 255, 255], 0.86);
  const border =
    luminance > 0.85
      ? mix(rgb, [100, 116, 139], 0.45)
      : mix(rgb, [255, 255, 255], 0.5);
  const text = mix(rgb, [15, 23, 42], 0.62);

  return {
    className: '',
    style: {
      backgroundColor: toHex(background),
      color: toHex(text),
      borderColor: toHex(border),
    },
  };
}
