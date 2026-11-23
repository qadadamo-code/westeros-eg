/** الموارد البشرية (Cost Control version, 0043_hr_docs.sql): every HR record is one row, told apart by `kind`. */
interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  restaurantId: string;
}

export interface HrDoc extends Row {
  kind: string;
  code: string;
  name: string;
  /** the employee (membership id) the row belongs to; null for shared rows (settings, departments, jobs …) */
  memberId: string | null;
  branchId: string | null;
  status: string;
  /** "YYYY-MM-DD" or null */
  date: string | null;
  data: Record<string, unknown>;
}
