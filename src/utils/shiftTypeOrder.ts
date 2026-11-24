import { ShiftType, ShiftTypeId } from '../types/shift';

const BUILT_IN_DISPLAY_ORDER: ShiftTypeId[] = [
  'EARLY',
  'DAY',
  'LATE',
  'NIGHT',
  'NIGHT_NEXT',
  'HOLIDAY',
  'PAID_LEAVE',
];

export function getOrderedShiftTypes(
  shiftTypes: Record<ShiftTypeId, ShiftType>
): ShiftType[] {
  const builtInOrder = new Map(BUILT_IN_DISPLAY_ORDER.map((id, index) => [id, index]));

  return Object.values(shiftTypes)
    .map((shiftType, index) => ({
      shiftType,
      index,
      fallbackOrder:
        builtInOrder.get(shiftType.id) ?? BUILT_IN_DISPLAY_ORDER.length + index,
    }))
    .sort((first, second) => {
      const firstOrder = first.shiftType.displayOrder ?? first.fallbackOrder;
      const secondOrder = second.shiftType.displayOrder ?? second.fallbackOrder;
      return firstOrder - secondOrder || first.index - second.index;
    })
    .map(({ shiftType }) => shiftType);
}
