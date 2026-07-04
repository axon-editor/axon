export const AXON_PROBLEMS_TAB_PATH = "axon://workbench/problems";

export function isProblemsTabPath(tabPath: string) {
  return tabPath === AXON_PROBLEMS_TAB_PATH;
}
