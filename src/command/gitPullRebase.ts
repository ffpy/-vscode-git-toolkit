import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { NOT_COMMIT_STASH, LOCAL_DEBUG_STASH, log, execCommand, getSkipWorktreeFiles, restoreStash, getOutputChannel, selectGitWorkspace } from '../utils';

export async function gitPullRebase() {
    try {
        getOutputChannel().show();
        
        // Select workspace
        const workspacePath = await selectGitWorkspace(l10n.t('git-toolkit.pull.selectWorkspace'));
        if (!workspacePath) {
            return;
        }
        
        // Stash uncommitted code
        log(l10n.t('git-toolkit.pull.stashingUncommitted'));
        await execCommand('git', ['stash', '-u', '-m', NOT_COMMIT_STASH], workspacePath);

        // Stash debug code
        log(l10n.t('git-toolkit.pull.stashingDebug'));
        const skipWorktreeFiles = await getSkipWorktreeFiles(workspacePath);
        if (skipWorktreeFiles.length > 0) {
            log(l10n.t('git-toolkit.pull.debugFiles', skipWorktreeFiles.join('\n')));
            await execCommand('git', ['update-index', '--no-skip-worktree', ...skipWorktreeFiles], workspacePath);
            await execCommand('git', ['stash', '-u', '-m', LOCAL_DEBUG_STASH], workspacePath);
        }

        // Pull remote code
        log(l10n.t('git-toolkit.pull.pullingRemote'));
        const pullOutput = await execCommand('git', ['pull', 'origin', '--rebase'], workspacePath);
        log(pullOutput);

        // Restore debug code
        log(l10n.t('git-toolkit.pull.restoringDebug'));
        await restoreStash(LOCAL_DEBUG_STASH, workspacePath);
        const modifiedFiles = (await execCommand('git', ['ls-files', '-m'], workspacePath)).split('\n').filter(Boolean);
        if (modifiedFiles.length > 0) {
            await execCommand('git', ['update-index', '--skip-worktree', ...modifiedFiles], workspacePath);
        }

        // Restore uncommitted code
        log(l10n.t('git-toolkit.pull.restoringUncommitted'));
        await restoreStash(NOT_COMMIT_STASH, workspacePath);

        log(l10n.t('git-toolkit.pull.completed'));
        vscode.window.showInformationMessage(l10n.t('git-toolkit.pull.completed'));
    } catch (error: any) {
        const errorMessage = l10n.t('git-toolkit.pull.failed', error.message);
        log(errorMessage);
        console.error(error);
        vscode.window.showErrorMessage(errorMessage);
    }
} 