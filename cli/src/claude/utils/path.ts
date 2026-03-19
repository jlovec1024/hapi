import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function getProjectPath(workingDirectory: string, claudeHomeDir: string = homedir()) {
    const projectId = resolve(workingDirectory).replace(/[^a-zA-Z0-9]/g, '-');
    return join(claudeHomeDir, '.claude', 'projects', projectId);
}
