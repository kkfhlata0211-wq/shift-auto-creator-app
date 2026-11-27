import { Staff } from '../types/shift';

export function getStaffDisplayOrder(staffList: Staff[]): Staff[] {
  return [...staffList].sort(
    (first, second) =>
      Number(first.employmentType === 'PART_TIME') -
      Number(second.employmentType === 'PART_TIME')
  );
}
