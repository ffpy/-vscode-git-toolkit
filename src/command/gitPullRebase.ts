import * as vscode from 'vscode';
import { NOT_COMMIT_STASH, LOCAL_DEBUG_STASH, log, execCommand, getSkipWorktreeFiles, restoreStash, getOutputChannel, selectGitWorkspace } from '../utils';

export async function gitPullRebase() {
    try {
        getOutputChannel().show();
        
        // Select workspace
        const workspacePath = await selectGitWorkspace('Select workspace for Git Pull Rebase');
        if (!workspacePath) {
            return;
        }
        
        // Stash uncommitted code
        log('Stashing uncommitted code...');
        await execCommand('git', ['stash', '-u', '-m', NOT_COMMIT_STASH], workspacePath);

        // Stash debug code
        log('Stashing debug code...');
        const skipWorktreeFiles = await getSkipWorktreeFiles(workspacePath);
        if (skipWorktreeFiles.length > 0) {
            log(`Debug files to be stashed:\n${skipWorktreeFiles.join('\n')}`);
            await execCommand('git', ['update-index', '--no-skip-worktree', ...skipWorktreeFiles], workspacePath);
            await execCommand('git', ['stash', '-u', '-m', LOCAL_DEBUG_STASH], workspacePath);
        }

        // Pull remote code
        log('Pulling remote code...');
        const pullOutput = await execCommand('git', ['pull', 'origin', '--rebase'], workspacePath);
        log(pullOutput);

        // Restore debug code
        log('Restoring debug code...');
        await restoreStash(LOCAL_DEBUG_STASH, workspacePath);
        const modifiedFiles = (await execCommand('git', ['ls-files', '-m'], workspacePath)).split('\n').filter(Boolean);
        if (modifiedFiles.length > 0) {
            await execCommand('git', ['update-index', '--skip-worktree', ...modifiedFiles], workspacePath);
        }

        // Restore uncommitted code
        log('Restoring uncommitted code...');
        await restoreStash(NOT_COMMIT_STASH, workspacePath);

        log('Git pull completed!');
        vscode.window.showInformationMessage('Git pull completed!');
    } catch (error: any) {
        const errorMessage = `Git pull failed: ${error.message}`;
        log(errorMessage);
        console.error(error);
        vscode.window.showErrorMessage(errorMessage);
    }
} 