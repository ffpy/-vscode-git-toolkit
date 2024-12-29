import * as vscode from 'vscode';
import { spawn } from 'child_process';

/** Git stash identifier: Uncommitted code */
export const NOT_COMMIT_STASH = 'not-commit';
/** Git stash identifier: Debug code */
export const LOCAL_DEBUG_STASH = 'local-debug';

/** Output channel */
let outputChannel: vscode.OutputChannel;

/** Cache for Git repository check results */
const gitRepoCache = new Map<string, boolean>();

/**
 * Get output channel
 */
export function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('git-toolkit');
    }
    return outputChannel;
}

/**
 * Initialize output channel
 */
export function initOutputChannel(context: vscode.ExtensionContext) {
    const channel = getOutputChannel();
    context.subscriptions.push(channel);
}

/**
 * Log message
 * @param message Log message
 */
export function log(message: string) {
    const channel = getOutputChannel();
    const timestamp = new Date().toISOString();
    channel.appendLine(`[${timestamp}] ${message}`);
}

/**
 * Execute command and get output
 * @param command Command
 * @param args Arguments
 * @param cwd Working directory
 * @returns Command output
 */
export function execCommand(command: string, args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Get workspace path
        if (!cwd) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                reject(new Error('No workspace is open'));
                return;
            }
            cwd = workspaceFolder.uri.fsPath;
        }

        // Print executing command
        log(`Executing command: ${command} ${args.join(' ')}`);

        const process = spawn(command, args, { 
            shell: true,
            cwd
        });
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            log(`Output: ${str.trim()}`);
        });

        process.stderr.on('data', (data) => {
            const str = data.toString();
            stderr += str;
            log(`Error: ${str.trim()}`);
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(stderr || stdout));
            }
        });

        process.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Get list of skip-worktree files
 * @param workspacePath Workspace path
 */
export async function getSkipWorktreeFiles(workspacePath: string): Promise<string[]> {
    try {
        const output = await execCommand('git', ['ls-files', '-v'], workspacePath);
        return output.split('\n')
            .filter(line => line.startsWith('S '))
            .map(line => line.slice(2).trim());
    } catch (error) {
        log(`Failed to get skip-worktree files: ${error}`);
        return [];
    }
}

/**
 * Restore stashed changes
 * @param message stash identifier
 * @param workspacePath Workspace path
 */
export async function restoreStash(message: string, workspacePath: string): Promise<void> {
    const output = await execCommand('git', ['stash', 'list'], workspacePath);
    const stashLine = output.split('\n').find(line => line.includes(message));

    if (stashLine) {
        const stashRef = stashLine.split(':')[0];
        log(`Found stashed changes: ${stashRef}`);
        
        await execCommand('git', ['stash', 'pop', stashRef], workspacePath);
    } else {
        log(`No stashed changes found for '${message}'`);
    }
}

/**
 * Check if specified path is a Git repository
 * @param path Path to check
 * @returns Whether it is a Git repository
 */
export async function isGitRepository(path: string): Promise<boolean> {
    // First check cache
    if (gitRepoCache.has(path)) {
        return gitRepoCache.get(path)!;
    }

    try {
        await execCommand('git', ['rev-parse', '--git-dir'], path);
        gitRepoCache.set(path, true);
        return true;
    } catch {
        gitRepoCache.set(path, false);
        return false;
    }
}

/**
 * Select Git workspace
 * @param placeHolder Placeholder text for selection box
 * @returns Selected workspace path, or undefined if user cancels selection
 */
export async function selectGitWorkspace(placeHolder: string): Promise<string | undefined> {
    const gitWorkspaceFolders = await getGitWorkspaceFolders();
    if (gitWorkspaceFolders.length === 0) {
        throw new Error('No Git repository found');
    }

    if (gitWorkspaceFolders.length === 1) {
        return gitWorkspaceFolders[0].uri.fsPath;
    }

    const selected = await vscode.window.showQuickPick(
        gitWorkspaceFolders.map(folder => ({
            label: folder.name,
            description: folder.uri.fsPath,
            path: folder.uri.fsPath
        })),
        { placeHolder }
    );

    return selected?.path;
}

/**
 * Clear cache for Git repository check results
 * @param path If provided, only clear cache for that path; otherwise clear all caches
 */
export function clearGitRepoCache(path?: string): void {
    if (path) {
        gitRepoCache.delete(path);
    } else {
        gitRepoCache.clear();
    }
}

/**
 * Get all Git workspace folders
 * @returns List of Git workspace folders
 */
export async function getGitWorkspaceFolders(): Promise<vscode.WorkspaceFolder[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return [];
    }

    const gitFolders: vscode.WorkspaceFolder[] = [];
    for (const folder of workspaceFolders) {
        if (await isGitRepository(folder.uri.fsPath)) {
            gitFolders.push(folder);
        }
    }
    return gitFolders;
} 