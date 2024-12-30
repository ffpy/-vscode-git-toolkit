import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { execCommand, log, selectGitWorkspace, getOutputChannel } from '../utils';

/** Git Commit Squash Tool */
export async function gitSquashCommits() {
    try {
        getOutputChannel().show();

        // Select workspace
        const workspacePath = await selectGitWorkspace(l10n.t('git-toolkit.squash.selectWorkspace'));
        if (!workspacePath) {
            return;
        }

        const commits = await getCommits(workspacePath);
        if (commits.length === 0) {
            throw new Error(l10n.t('git-toolkit.squash.noCommits'));
        }

        // Sort commits by date in descending order
        commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Create QuickPick
        const quickPick = vscode.window.createQuickPick();
        quickPick.title = l10n.t('git-toolkit.squash.commitList', workspacePath);
        quickPick.placeholder = l10n.t('git-toolkit.squash.selectCommits');
        quickPick.canSelectMany = false;

        // Set options
        quickPick.items = commits.map(commit => ({
            label: commit.message,
            description: commit.hash,
            detail: l10n.t('git-toolkit.squash.authorCommitted', commit.author, commit.date),
            commit
        }));

        // Show QuickPick
        quickPick.show();

        // Wait for user selection
        const selection = await new Promise<readonly vscode.QuickPickItem[]>(resolve => {
            quickPick.onDidAccept(() => {
                resolve([quickPick.selectedItems[0]]);
                quickPick.hide();
            });
            quickPick.onDidHide(() => {
                resolve([]);
                quickPick.dispose();
            });
        });

        if (selection.length === 0) {
            return;
        }

        // Get selected commit
        const selectedCommit = (selection[0] as any).commit;
        const commitsToSquash = commits.filter(commit => 
            new Date(commit.date).getTime() >= new Date(selectedCommit.date).getTime()
        );

        if (commitsToSquash.length <= 1) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.squash.noCommitsToSquash'));
            return;
        }

        await squashSelectedCommits(commitsToSquash, workspacePath);
    } catch (error: any) {
        const errorMessage = l10n.t('git-toolkit.squash.failedToSquash', error.message);
        log(errorMessage);
        console.error(error);
        vscode.window.showErrorMessage(errorMessage);
    }
}

/**
 * Get commit list
 */
async function getCommits(workspacePath: string): Promise<any[]> {
    try {
        // First try to get basic log information
        const testOutput = await execCommand('git', ['log', '-n', '1'], workspacePath);
        if (!testOutput) {
            return [];
        }

        // If basic command succeeds, get formatted output
        const output = await execCommand('git', [
            'log',
            '-n',
            '10',
            '--pretty=format:%h|%an|%ad|%s',
            '--date=format:%Y-%m-%d %H:%M:%S',
            '--no-merges'
        ], workspacePath);

        if (!output) {
            return [];
        }

        return output.split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
                const [hash, author, date, ...messageParts] = line.split('|');
                return {
                    hash,
                    author,
                    date,
                    message: messageParts.join('|') // Prevent commit message from containing | character
                };
            });
    } catch (error: any) {
        const errorMessage = l10n.t('git-toolkit.squash.failedToGetLog', error.message);
        log(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        return [];
    }
}

/**
 * Squash selected commits
 */
async function squashSelectedCommits(commits: any[], workspacePath: string) {
    if (commits.length < 2) {
        throw new Error(l10n.t('git-toolkit.squash.selectAtLeastTwo'));
    }

    // Get earliest commit
    const earliestCommit = commits[commits.length - 1].hash;

    // Get all commit messages
    const commitMessages = await Promise.all(commits.map(commit => getCommitMessage(commit.hash, workspacePath)));
    
    // Check if all messages are the same
    const allMessagesAreSame = commitMessages.every(msg => msg === commitMessages[0]);
    
    // Prepare new commit message
    let defaultMessage = allMessagesAreSame 
        ? commitMessages[0] 
        : commitMessages.join('\n\n');

    // Create temporary file to edit commit message
    const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('untitled:commit-message.txt')
    );
    await vscode.window.showTextDocument(document);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 0), defaultMessage);
    await vscode.workspace.applyEdit(edit);
    
    // Wait for user to edit and confirm
    const editResult = await vscode.window.showInformationMessage(
        l10n.t('git-toolkit.squash.editMessage'),
        l10n.t('git-toolkit.common.ok'),
        l10n.t('git-toolkit.common.cancel')
    );

    // Get content before closing editor
    const newMessage = editResult === l10n.t('git-toolkit.common.ok') ? document.getText() : undefined;
    
    // Discard changes before closing editor
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');

    if (!newMessage) {
        return;
    }

    log(l10n.t('git-toolkit.squash.newMessage', newMessage));
    log(l10n.t('git-toolkit.squash.earliestCommit', earliestCommit));

    try {
        // Soft reset to the commit before earliest
        await execCommand('git', ['reset', '--soft', `${earliestCommit}^`], workspacePath);
        
        // Create new commit
        await execCommand('git', ['commit', '-m', newMessage], workspacePath);
        
        vscode.window.showInformationMessage(l10n.t('git-toolkit.squash.success'));
    } catch (error: any) {
        const errorMessage = l10n.t('git-toolkit.squash.failedToSquash', error.message);
        vscode.window.showErrorMessage(errorMessage);
        throw error;
    }
}

/**
 * Get commit message
 */
async function getCommitMessage(hash: string, workspacePath: string): Promise<string> {
    const output = await execCommand('git', ['log', '-1', '--pretty=%B', hash], workspacePath);
    return output.trim();
} 