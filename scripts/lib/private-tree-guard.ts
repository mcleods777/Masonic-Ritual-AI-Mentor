const PRIVATE_TREE_PREFIX = "rituals/";

export function findPrivateTreePaths(paths: readonly string[]): string[] {
  return paths.filter(
    (filePath) => filePath === "rituals" || filePath.startsWith(PRIVATE_TREE_PREFIX),
  );
}
