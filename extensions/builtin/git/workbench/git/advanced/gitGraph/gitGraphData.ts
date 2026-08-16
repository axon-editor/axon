import {
  type GitGraphResult,
  type GitHistoryResult,
} from "@axon-editor/shared/git";

export interface GitGraphData {
  graph: GitGraphResult;
  history: GitHistoryResult;
}

const graphDataByRepository = new Map<string, GitGraphData>();
const pendingGraphDataByRepository = new Map<string, Promise<GitGraphData>>();

export function getCachedGitGraphData(folderPath: string) {
  return graphDataByRepository.get(folderPath) ?? null;
}

export async function loadGitGraphData(
  folderPath: string,
  forceRefresh = false,
) {
  if (!forceRefresh) {
    const cached = graphDataByRepository.get(folderPath);
    if (cached) return cached;
  }

  // Multiple graph surfaces can exist in editor splits or the sidebar. I share
  // one in-flight request per repository so mounting a second view cannot spawn
  // duplicate Git processes while the first load is still running.
  const pending = pendingGraphDataByRepository.get(folderPath);
  if (pending) return pending;

  const request = Promise.all([
    window.axon.getGitGraph(folderPath),
    window.axon.getGitHistory(folderPath),
  ])
    .then(([graph, history]) => {
      const data = { graph, history };
      graphDataByRepository.set(folderPath, data);
      return data;
    })
    .finally(() => {
      pendingGraphDataByRepository.delete(folderPath);
    });

  pendingGraphDataByRepository.set(folderPath, request);
  return request;
}
