/**
 * Implementation file for Git changelist related commands
 */

import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { Changelist, ChangelistManager, DEFAULT_CHANGELIST_NAME } from '../model/changelist';
import { ChangelistTreeItem } from '../view/changelistView';
import { execCommand, getGitWorkspaceFolders } from '../utils';
import * as path from 'path';
import { Uri } from 'vscode';

/**
 * Check if a file is tracked by Git
 * @param filePath Relative file path
 * @param workspacePath Workspace path
 * @returns Promise<boolean> Returns true if file is tracked by Git
 */
async function isFileTracked(filePath: string, workspacePath: string): Promise<boolean> {
    try {
        // Use git ls-files to check if file is tracked
        await execCommand('git', ['ls-files', '--error-unmatch', filePath], workspacePath);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get all modified files (including staged and unstaged files, excluding untracked files)
 * @param workspacePath Workspace path
 * @returns Promise<string[]> Returns an array of modified file paths
 */
async function getModifiedFiles(workspacePath: string): Promise<string[]> {
    try {
        // Use git status --porcelain -uno to get all modified files (excluding untracked files)
        const output = await execCommand('git', ['status', '--porcelain', '-uno'], workspacePath);
        
        // Parse output, first two chars are status code, file path starts from third char
        const files = output.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => line.slice(3).trim());
        
        // Return array after removing duplicates using Set
        return Array.from(new Set(files));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToGetModifiedFiles', { error: errorMessage }));
        return [];
    }
}

/**
 * Create new changelist
 * Prompt user to enter changelist name and create new changelist
 */
export async function addChangelist(): Promise<void> {
    const gitWorkspaceFolders = await getGitWorkspaceFolders();
    if (gitWorkspaceFolders.length === 0) {
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.noGitRepository'));
        return;
    }

    let workspacePath: string | undefined;
    if (gitWorkspaceFolders.length > 1) {
        interface WorkspaceQuickPickItem extends vscode.QuickPickItem {
            path: string;
        }

        const selected = await vscode.window.showQuickPick<WorkspaceQuickPickItem>(
            gitWorkspaceFolders.map(folder => ({
                label: folder.name,
                description: folder.uri.fsPath,
                path: folder.uri.fsPath
            })),
            { placeHolder: l10n.t('git-toolkit.changelist.selectWorkspaceToCreate') }
        );
        if (!selected) {
            return;
        }
        workspacePath = selected.path;
    } else {
        workspacePath = gitWorkspaceFolders[0].uri.fsPath;
    }

    const name = await vscode.window.showInputBox({
        prompt: l10n.t('git-toolkit.changelist.enterNewName'),
        placeHolder: l10n.t('git-toolkit.changelist.changelistName')
    });

    if (name && workspacePath) {
        if (name === DEFAULT_CHANGELIST_NAME) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.cannotUseDefaultName', { name: DEFAULT_CHANGELIST_NAME }));
            return;
        }

        const manager = ChangelistManager.getInstance();
        if (manager.getChangelists(workspacePath).find(cl => cl.name === name)) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.alreadyExists', { name }));
            return;
        }

        try {
            await manager.addChangelist(name, workspacePath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToCreate', { error: errorMessage }));
        }
    }
}

/**
 * Remove specified changelist
 * @param item Changelist view item, if not provided, prompt user to select a changelist to remove
 */
export async function removeChangelist(item: any): Promise<void> {
    if (!item?.changelist?.name) {
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.selectToRemove'));
        return;
    }

    const result = await vscode.window.showWarningMessage(
        l10n.t('git-toolkit.changelist.confirmDelete', { name: item.changelist.name }),
        { modal: true },
        l10n.t('git-toolkit.common.confirm')
    );

    if (result !== l10n.t('git-toolkit.common.confirm')) {
        return;
    }

    try {
        await ChangelistManager.getInstance().removeChangelist(item.changelist.name, item.changelist.workspacePath);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToDelete', { error: errorMessage }));
    }
}

/**
 * Rename changelist
 * @param item Changelist view item
 */
export async function renameChangelist(item: any): Promise<void> {
    if (!item?.changelist?.name) {
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.selectToRename'));
        return;
    }

    const newName = await vscode.window.showInputBox({
        prompt: l10n.t('git-toolkit.changelist.enterNewName'),
        placeHolder: l10n.t('git-toolkit.changelist.newName')
    });

    if (newName) {
        if (newName === DEFAULT_CHANGELIST_NAME) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.cannotRenameToDefault', { name: DEFAULT_CHANGELIST_NAME }));
            return;
        }

        const manager = ChangelistManager.getInstance();
        if (manager.getChangelists(item.changelist.workspacePath).find(cl => cl.name === newName)) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.alreadyExists', { name: newName }));
            return;
        }

        try {
            await manager.renameChangelist(item.changelist.name, newName, item.changelist.workspacePath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToRename', { error: errorMessage }));
        }
    }
}

/**
 * Add file to changelist
 * @param uriOrArgs File URI or parameter object
 */
export async function addToChangelist(uriOrArgs: { resourceUri: vscode.Uri }): Promise<void> {
    let filePath: string | undefined;
    let workspacePath: string | undefined;
    
    try {
        const uri = uriOrArgs.resourceUri;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.fileNotInWorkspace'));
            return;
        }

        workspacePath = workspaceFolder.uri.fsPath;
        filePath = vscode.workspace.asRelativePath(uri, false);

        // Check if file is tracked by Git
        if (!(await isFileTracked(filePath, workspacePath))) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.fileNotTracked'));
            return;
        }

        const changelists = ChangelistManager.getInstance().getChangelists(workspacePath);
        
        if (changelists.length === 0) {
            vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.noAvailableChangelists'));
            return;
        }

        let targetChangelist: Changelist | undefined;

        if (changelists.length === 1) {
            // Use single changelist if there's only one
            targetChangelist = changelists[0];
        } else {
            // Show quick pick if there are multiple changelists
            const items = changelists.map(cl => ({
                label: cl.name,
                description: l10n.t('git-toolkit.changelist.filesCount', { count: cl.items.length }),
                changelist: cl
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: l10n.t('git-toolkit.changelist.selectToMoveTo')
            });

            if (selected) {
                targetChangelist = selected.changelist;
            }
        }

        if (targetChangelist) {
            try {
                await targetChangelist.addFile(filePath);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToAddFile', { error: errorMessage }));
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.errorProcessingFile', { error: errorMessage }));
    }
}

/**
 * Remove specified file from changelist
 * @param item Changelist view item, must contain changelist and file attributes
 */
export async function removeFromChangelist(item: any): Promise<void> {
    if (!item?.changelist?.name || !item?.file) {
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.selectFileToRemove'));
        return;
    }

    try {
        await item.changelist.removeFile(item.file);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToRemoveFile', { error: errorMessage }));
    }
}

/**
 * Remove all files from changelist
 * Prompt user to confirm operation
 * @param item Changelist tree view item
 */
export async function removeAllFromChangelist(item: ChangelistTreeItem): Promise<void> {
    if (!item?.changelist?.name) {
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.selectChangelistToClear'));
        return;
    }

    const result = await vscode.window.showWarningMessage(
        l10n.t('git-toolkit.changelist.confirmRemoveAll', { name: item.changelist.name }),
        { modal: true },
        l10n.t('git-toolkit.common.confirm')
    );

    if (result !== l10n.t('git-toolkit.common.confirm')) {
        return;
    }

    try {
        const changelist = item.changelist;
        // Copy file list to avoid modifying original array in loop
        const files = [...changelist.items.map(item => item.path)];
        for (const file of files) {
            await changelist.removeFile(file);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToRemoveAll', { error: errorMessage }));
    }
}

/**
 * Add staged files to changelist
 * Show multi-select interface for user to select files to add
 * @param item Changelist tree view item
 */
export async function addStagedToChangelist(item: ChangelistTreeItem): Promise<void> {
    const changelist = item.changelist;
    if (!changelist?.name) {
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.selectChangelistToAddFiles'));
        return;
    }

    try {
        // Get all modified files
        const modifiedFiles = await getModifiedFiles(changelist.workspacePath);
        
        if (modifiedFiles.length === 0) {
            vscode.window.showInformationMessage(l10n.t('git-toolkit.changelist.noModifiedFiles'));
            return;
        }

        // Create QuickPick multi-select interface
        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = true;
        quickPick.title = l10n.t('git-toolkit.changelist.selectFilesToAdd', { name: changelist.name });
        quickPick.placeholder = l10n.t('git-toolkit.changelist.selectFilesMulti');
        quickPick.items = modifiedFiles.map(file => ({ 
            label: file
        }));

        quickPick.onDidAccept(async () => {
            const selectedFiles = quickPick.selectedItems.map(item => item.label);
            quickPick.hide();

            if (selectedFiles.length > 0) {
                try {
                    // Add selected files to changelist
                    for (const file of selectedFiles) {
                        await changelist.addFile(file);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.failedToAddFile', { error: errorMessage }));
                }
            }
        });

        quickPick.show();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(l10n.t('git-toolkit.changelist.errorProcessingFile', { error: errorMessage }));
    }
}

/**
 * Refresh all changelists status
 * Reload changelist manager status
 */
export function refreshChangelists(): void {
    ChangelistManager.getInstance().loadState();
}

/**
 * Open diff view for file
 * @param workspacePath Workspace path
 * @param filePath File path relative to workspace
 */
export async function openDiff(workspacePath: string, filePath: string) {
    try {
        const absolutePath = path.join(workspacePath, filePath);
        const fileUri = Uri.file(absolutePath);
        
        // Create a title for the diff view
        const title = path.basename(filePath);
        
        // Create Git URI for the index version
        // Use VS Code's built-in Git resource URI format
        const gitUri = fileUri.with({ 
            scheme: 'git',
            path: fileUri.path,
            query: JSON.stringify({
                path: fileUri.fsPath,
                ref: 'HEAD'
            })
        });
        
        // Open diff view
        await vscode.commands.executeCommand(
            'vscode.diff',
            gitUri,              // git index version
            fileUri,            // working tree version
            `${title} (Index ↔ Working Tree)`
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(l10n.t('git-toolkit.diff.failedToOpen', { error: errorMessage }));
    }
} 