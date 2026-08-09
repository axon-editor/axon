import path from "node:path";

const CLI_OPEN_FOLDER_FLAG = "--axon-open-folder";

export function findCliOpenFolderArgument(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === CLI_OPEN_FOLDER_FLAG) {
      const candidate = argv[index + 1];
      return candidate && path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : null;
    }

    const prefix = `${CLI_OPEN_FOLDER_FLAG}=`;
    if (argument.startsWith(prefix)) {
      const candidate = argument.slice(prefix.length);
      return candidate && path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : null;
    }
  }

  // Linux and Windows launchers commonly append the selected folder without a
  // named flag. The executable is argv[0], while Electron switches and protocol
  // URLs are not workspace paths, so the first remaining absolute argument is
  // the only safe legacy candidate.
  const candidate = argv
    .slice(1)
    .find(
      (argument) =>
        path.isAbsolute(argument) &&
        !argument.startsWith("axon:") &&
        !argument.startsWith("-") &&
        !argument.endsWith(".app"),
    );
  return candidate ? path.resolve(candidate) : null;
}
