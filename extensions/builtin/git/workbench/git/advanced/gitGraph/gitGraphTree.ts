import { type GitHistoryFile } from "@axon-editor/shared/git";

export interface GitGraphTreeNode {
  name: string;
  path: string;
  children: GitGraphTreeNode[];
  file: GitHistoryFile | null;
}

export function buildGitGraphFileTree(files: GitHistoryFile[]) {
  const root: GitGraphTreeNode = {
    name: "",
    path: "",
    children: [],
    file: null,
  };
  for (const file of files) {
    const parts = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    let parent = root;
    parts.forEach((part, index) => {
      const nodePath = parts.slice(0, index + 1).join("/");
      let node = parent.children.find((child) => child.name === part);
      if (!node) {
        node = { name: part, path: nodePath, children: [], file: null };
        parent.children.push(node);
      }
      if (index === parts.length - 1) node.file = file;
      parent = node;
    });
  }
  const sort = (nodes: GitGraphTreeNode[]) => {
    nodes.sort((a, b) =>
      Boolean(a.file) === Boolean(b.file)
        ? a.name.localeCompare(b.name)
        : a.file
          ? 1
          : -1,
    );
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}
