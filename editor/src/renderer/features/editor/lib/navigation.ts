export interface EditorNavigationTarget {
  id: number;
  path: string;
  line: number;
  column: number;
  length?: number;
}
