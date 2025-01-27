import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { execCommand, log, selectGitWorkspace, getOutputChannel, restoreStash } from '../utils';

/** Maximum number of commits to fetch */
const MAX_COMMITS = 10;
/** Prefix for temporary branches created during squash */
const TEMP_BRANCH_PREFIX = 'temp-squash';

/** Represents a Git commit with its essential information */
interface GitCommit {
    shortHash: string;    // Short version of commit hash
    hash: string;         // Full commit hash
    author: string;       // Commit author
    date: string;         // Commit date
    message: string;      // Commit message
}

/** Represents the Git repository state that needs to be saved and restored */
interface GitState {
    currentBranch: string;   // Current branch name
    originalHead: string;    // Original HEAD position
    tempBranch: string;      // Temporary branch name
    hasChanges: boolean;     // Whether there are uncommitted changes
    stashName: string;       // Name of the stash if changes are stashed
}

/** Represents the range of commits involved in the squash operation */
interface CommitRange {
    commitsToSquash: GitCommit[];    // Commits to be squashed
    commitsToReapply: GitCommit[];   // Commits between selected range that need to be reapplied
    laterCommits: GitCommit[];       // Commits after the selected range
}

/** 
 * Retrieves the full commit message for a given commit hash
 * @param hash - The commit hash
 * @param workspacePath - Path to the Git repository
 */
async function getCommitMessage(hash: string, workspacePath: string): Promise<string> {
    const output = await execCommand('git', ['log', '-1', '--pretty=%B', hash], workspacePath);
    return output.trim();
}

/**
 * Fetches recent Git commits from the repository
 * @param workspacePath - Path to the Git repository
 * @returns Array of GitCommit objects, empty array if no commits or error
 */
async function getCommits(workspacePath: string): Promise<GitCommit[]> {
    try {
        // Verify git repository
        const testOutput = await execCommand('git', ['log', '-n', '1'], workspacePath);
        if (!testOutput) {
            return [];
        }

        const output = await execCommand('git', [
            'log',
            '-n',
            MAX_COMMITS.toString(),
            '--pretty=format:%h|%H|%an|%ad|%s',
            '--date=format:%Y-%m-%d %H:%M:%S',
            '--no-merges'
        ], workspacePath);

        if (!output) {
            return [];
        }

        return output.split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
                const [shortHash, hash, author, date, ...messageParts] = line.split('|');
                return {
                    shortHash,
                    hash,
                    author,
                    date,
                    message: messageParts.join('|')
                };
            });
    } catch (error: any) {
        const errorMessage = l10n.t('git-toolkit.squash.failedToGetLog', error.message);
        log(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        return [];
    }
}

// UI Operations
/**
 * Opens an editor for the user to modify the commit message
 * @param defaultMessage - Default commit message to show in editor
 * @returns Modified message or undefined if cancelled
 */
async function showCommitMessageEditor(defaultMessage: string): Promise<string | undefined> {
    const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('untitled:commit-message.txt')
    );
    await vscode.window.showTextDocument(document);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 0), defaultMessage);
    await vscode.workspace.applyEdit(edit);
    
    const editResult = await vscode.window.showInformationMessage(
        l10n.t('git-toolkit.squash.editMessage'),
        l10n.t('git-toolkit.common.ok'),
        l10n.t('git-toolkit.common.cancel')
    );

    const newMessage = editResult === l10n.t('git-toolkit.common.ok') ? document.getText().trim() : undefined;
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    
    return newMessage;
}

/**
 * Shows a quick pick dialog for selecting commits to squash
 * @param commits - Available commits to choose from
 * @returns Selected commits array
 */
async function selectCommitsToSquash(commits: GitCommit[]): Promise<GitCommit[]> {
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = l10n.t('git-toolkit.squash.commitList');
    quickPick.placeholder = l10n.t('git-toolkit.squash.selectCommits');
    quickPick.canSelectMany = true;

    quickPick.items = commits.map(commit => ({
        label: commit.message,
        description: '',
        detail: l10n.t('git-toolkit.squash.authorCommitted', { 
            author: commit.author, 
            date: commit.date, 
            hash: commit.shortHash 
        }),
        commit
    }));

    quickPick.show();

    const selection = await new Promise<readonly vscode.QuickPickItem[]>(resolve => {
        quickPick.onDidAccept(() => {
            resolve(quickPick.selectedItems);
            quickPick.hide();
        });
        
        quickPick.onDidHide(() => {
            quickPick.dispose();
        });
    });

    return selection.map((item: any) => item.commit);
}

// Core Squash Logic
/**
 * Cherry-picks a series of commits
 * Handles empty commits and conflicts
 */
async function cherryPickCommits(commits: GitCommit[], workspacePath: string) {
    for (const commit of commits) {
        try {
            await execCommand('git', ['cherry-pick', commit.hash], workspacePath);
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            if (errorMessage.includes('empty')) {
                await execCommand('git', ['cherry-pick', '--skip'], workspacePath);
            } else if (errorMessage.includes('conflict')) {
                await execCommand('git', ['cherry-pick', '--abort'], workspacePath);
                throw error;
            } else {
                throw error;
            }
        }
    }
}

/**
 * Determines the range of commits affected by the squash operation
 * Includes commits to be squashed, commits to be reapplied, and later commits
 */
async function getCommitRange(commits: GitCommit[], workspacePath: string): Promise<CommitRange> {
    const allCommits = await getCommits(workspacePath);
    const earliestHash = commits[0].hash;
    const latestHash = commits[commits.length - 1].hash;

    // Get commit order
    const revListOutput = await execCommand('git', [
        'rev-list',
        '--topo-order',
        `${earliestHash}^..${latestHash}`
    ], workspacePath);

    const commitOrder = revListOutput.split('\n').filter(hash => hash.trim());
    const selectedHashes = new Set(commits.map(c => c.hash));

    // Get unselected commits
    const commitsToReapply = allCommits
        .filter(commit => !selectedHashes.has(commit.hash) && commitOrder.includes(commit.hash))
        .sort((a, b) => commitOrder.indexOf(b.hash) - commitOrder.indexOf(a.hash));

    // Get later commits
    const laterCommitsOutput = await execCommand('git', [
        'rev-list',
        '--topo-order',
        'HEAD',
        `^${latestHash}`
    ], workspacePath);

    const laterCommitHashes = laterCommitsOutput.split('\n').filter(hash => hash.trim());
    // Sort later commits based on their topological order
    const laterCommits = allCommits
        .filter(commit => laterCommitHashes.includes(commit.hash))
        .sort((a, b) => laterCommitHashes.indexOf(a.hash) - laterCommitHashes.indexOf(b.hash));

    return {
        commitsToSquash: commits,
        commitsToReapply,
        laterCommits
    };
}

/**
 * Prepares the commit message for the squashed commit
 * If all commit messages are the same, uses that message
 * Otherwise, combines all messages with newlines
 */
async function prepareCommitMessage(commits: GitCommit[], workspacePath: string): Promise<string | undefined> {
    const commitMessages = (await Promise.all(commits.map(commit => 
        getCommitMessage(commit.hash, workspacePath)))).reverse();
    
    const allMessagesAreSame = commitMessages.every(msg => msg === commitMessages[0]);
    const defaultMessage = allMessagesAreSame ? commitMessages[0] : commitMessages.join('\n\n');
    
    return showCommitMessageEditor(defaultMessage);
}

/**
 * Saves the current state of the Git repository
 * Used for restoration in case of errors
 */
async function saveGitState(workspacePath: string): Promise<GitState> {
    const currentBranch = (await execCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], workspacePath)).trim();
    const originalHead = (await execCommand('git', ['rev-parse', 'HEAD'], workspacePath)).trim();
    const tempBranch = `${TEMP_BRANCH_PREFIX}-${Date.now()}`;
    
    const status = await execCommand('git', ['status', '--porcelain'], workspacePath);
    const hasChanges = status.trim().length > 0;
    const stashName = `${TEMP_BRANCH_PREFIX}-${Date.now()}`;

    return {
        currentBranch,
        originalHead,
        tempBranch,
        hasChanges,
        stashName
    };
}

/**
 * Creates a new commit that represents the squashed commits
 * Uses the tree from the current state and the parent from before the squashed commits
 */
async function createSquashedCommit(commits: GitCommit[], newMessage: string, workspacePath: string): Promise<string> {
    const treeHash = (await execCommand('git', ['write-tree'], workspacePath)).trim();
    const parentHash = (await execCommand('git', ['rev-parse', `${commits[0].hash}^`], workspacePath)).trim();
    return (await execCommand('git', ['commit-tree', treeHash, '-p', parentHash, '-m', newMessage], workspacePath)).trim();
}

/**
 * Restores the Git repository to its original state
 * Used both for cleanup and error recovery
 */
async function restoreGitState(state: GitState, workspacePath: string, error?: unknown) {
    try {
        await execCommand('git', ['checkout', state.currentBranch], workspacePath);
        if (error) {
            await execCommand('git', ['reset', '--hard', state.originalHead], workspacePath);
        }
        await execCommand('git', ['branch', '-D', state.tempBranch], workspacePath);

        if (state.hasChanges) {
            await restoreStash(state.stashName, workspacePath);
        }
    } catch (cleanupError) {
        log(`Cleanup error: ${cleanupError}`);
    }
}

/**
 * Main function to squash selected commits
 * Handles the entire squash process including:
 * - Commit ordering
 * - State management
 * - Cherry-picking
 * - Error recovery
 */
async function squashSelectedCommits(commits: GitCommit[], workspacePath: string) {
    if (commits.length < 2) {
        throw new Error(l10n.t('git-toolkit.squash.selectAtLeastTwo'));
    }

    // Sort commits by date
    commits.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Get commit ranges
    const { commitsToReapply, laterCommits } = await getCommitRange(commits, workspacePath);

    // Prepare commit message
    const newMessage = await prepareCommitMessage(commits, workspacePath);
    if (!newMessage) {
        return;
    }

    // Save git state
    const state = await saveGitState(workspacePath);
    
    try {
        if (state.hasChanges) {
            await execCommand('git', ['stash', 'push', '-m', state.stashName], workspacePath);
        }

        // Create and checkout temp branch
        await execCommand('git', ['checkout', '-b', state.tempBranch], workspacePath);
        await execCommand('git', ['reset', '--hard', `${commits[0].hash}^`], workspacePath);
        
        // Cherry-pick and create squashed commit
        await cherryPickCommits(commits, workspacePath);
        const newCommitHash = await createSquashedCommit(commits, newMessage, workspacePath);
        
        // Apply changes
        await execCommand('git', ['checkout', state.currentBranch], workspacePath);
        await execCommand('git', ['reset', '--hard', newCommitHash], workspacePath);

        // Reapply other commits
        await cherryPickCommits(commitsToReapply, workspacePath);
        await cherryPickCommits(laterCommits, workspacePath);
        
        vscode.window.showInformationMessage(l10n.t('git-toolkit.squash.success'));
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(l10n.t('git-toolkit.squash.failedToSquash', errorMessage));
        await restoreGitState(state, workspacePath, error);
        throw error;
    } finally {
        await restoreGitState(state, workspacePath);
    }
}

/**
 * Entry point for the Git squash command
 * Handles the high-level flow of the squash operation:
 * 1. Select workspace
 * 2. Get commits
 * 3. Select commits to squash
 * 4. Perform squash operation
 */
export async function gitSquashCommits() {
    try {
        getOutputChannel().show();

        const workspacePath = await selectGitWorkspace(l10n.t('git-toolkit.squash.selectWorkspace'));
        if (!workspacePath) {
            return;
        }

        const commits = await getCommits(workspacePath);
        if (commits.length === 0) {
            throw new Error(l10n.t('git-toolkit.squash.noCommits'));
        }

        const selectedCommits = await selectCommitsToSquash(commits);
        if (selectedCommits.length === 1) {
            vscode.window.showInformationMessage(l10n.t('git-toolkit.squash.selectOneCommit'));
            return;
        }
        if (selectedCommits.length === 0) {
            return;
        }

        await squashSelectedCommits(selectedCommits, workspacePath);
    } catch (error: any) {
        const errorMessage = l10n.t('git-toolkit.squash.failedToSquash', error.message);
        log(errorMessage);
        console.error(error);
        vscode.window.showErrorMessage(errorMessage);
    }
} 