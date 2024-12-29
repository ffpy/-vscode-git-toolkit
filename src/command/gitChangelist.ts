/**
 * Implementation file for Git changelist related commands
 */

import * as vscode from 'vscode';
import { Changelist, ChangelistManager, DEFAULT_CHANGELIST_NAME } from '../model/changelist';
import { ChangelistTreeItem } from '../view/changelistView';
import { execCommand, getGitWorkspaceFolders } from '../utils';

/**
 * Get all modified files (including staged and unstaged files)
 * @param workspacePath Workspace path
 * @returns Promise<string[]> Returns an array of modified file paths
 */
async function getModifiedFiles(workspacePath: string): Promise<string[]> {
    try {
        // Use git status --porcelain to get all modified files
        const output = await execCommand('git', ['status', '--porcelain'], workspacePath);
        
        // Parse output, first two chars are status code, file path starts from third char
        const files = output.split('\n')
            .filter(line => line.trim() !== '')
            .map(line => line.slice(3).trim());
        
        // Return array after removing duplicates using Set
        return Array.from(new Set(files));
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to get modified files: ${error}`);
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
        vscode.window.showErrorMessage('No Git repository found');
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
            { placeHolder: 'Select workspace to create changelist' }
        );
        if (!selected) {
            return;
        }
        workspacePath = selected.path;
    } else {
        workspacePath = gitWorkspaceFolders[0].uri.fsPath;
    }

    const name = await vscode.window.showInputBox({
        prompt: 'Enter new changelist name',
        placeHolder: 'Changelist name'
    });

    if (name && workspacePath) {
        if (name === DEFAULT_CHANGELIST_NAME) {
            vscode.window.showErrorMessage(`Cannot create changelist with default name: ${DEFAULT_CHANGELIST_NAME}`);
            return;
        }

        const manager = ChangelistManager.getInstance();
        if (manager.getChangelists(workspacePath).find(cl => cl.name === name)) {
            vscode.window.showErrorMessage(`Changelist "${name}" already exists`);
            return;
        }

        try {
            await manager.addChangelist(name, workspacePath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create changelist: ${error}`);
        }
    }
}

/**
 * Remove specified changelist
 * @param item Changelist view item, if not provided, prompt user to select a changelist to remove
 */
export async function removeChangelist(item: any): Promise<void> {
    if (!item?.changelist?.name) {
        vscode.window.showErrorMessage('Please select a changelist to remove from the changelist view');
        return;
    }

    const result = await vscode.window.showWarningMessage(
        `Are you sure you want to delete changelist "${item.changelist.name}"?`,
        { modal: true },
        'Confirm'
    );

    if (result !== 'Confirm') {
        return;
    }

    try {
        await ChangelistManager.getInstance().removeChangelist(item.changelist.name, item.changelist.workspacePath);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete changelist: ${error}`);
    }
}

/**
 * Rename changelist
 * @param item Changelist view item
 */
export async function renameChangelist(item: any): Promise<void> {
    if (!item?.changelist?.name) {
        vscode.window.showErrorMessage('Please select a changelist to rename from the changelist view');
        return;
    }

    const newName = await vscode.window.showInputBox({
        prompt: 'Enter new changelist name',
        placeHolder: 'New name'
    });

    if (newName) {
        if (newName === DEFAULT_CHANGELIST_NAME) {
            vscode.window.showErrorMessage(`Cannot rename to default changelist name: ${DEFAULT_CHANGELIST_NAME}`);
            return;
        }

        const manager = ChangelistManager.getInstance();
        if (manager.getChangelists(item.changelist.workspacePath).find(cl => cl.name === newName)) {
            vscode.window.showErrorMessage(`Changelist "${newName}" already exists`);
            return;
        }

        try {
            await manager.renameChangelist(item.changelist.name, newName, item.changelist.workspacePath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename changelist: ${error}`);
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
            vscode.window.showErrorMessage('File is not in any workspace');
            return;
        }

        workspacePath = workspaceFolder.uri.fsPath;
        filePath = vscode.workspace.asRelativePath(uri, false);
        const changelists = ChangelistManager.getInstance().getChangelists(workspacePath);
        
        if (changelists.length === 0) {
            vscode.window.showErrorMessage('No available changelists, please create one first');
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
                description: `${cl.items.length} files`,
                changelist: cl
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select changelist to move to'
            });

            if (selected) {
                targetChangelist = selected.changelist;
            }
        }

        if (targetChangelist) {
            try {
                await targetChangelist.addFile(filePath);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to add file to changelist: ${error}`);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error processing file: ${error}`);
    }
}

/**
 * Remove specified file from changelist
 * @param item Changelist view item, must contain changelist and file attributes
 */
export async function removeFromChangelist(item: any): Promise<void> {
    if (!item?.changelist?.name || !item?.file) {
        vscode.window.showErrorMessage('Please select a file to remove from the changelist');
        return;
    }

    try {
        await item.changelist.removeFile(item.file);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to remove file from changelist: ${error}`);
    }
}

/**
 * Remove all files from changelist
 * Prompt user to confirm operation
 * @param item Changelist tree view item
 */
export async function removeAllFromChangelist(item: ChangelistTreeItem): Promise<void> {
    if (!item?.changelist?.name) {
        vscode.window.showErrorMessage('Please select a changelist to clear');
        return;
    }

    const result = await vscode.window.showWarningMessage(
        `Are you sure you want to remove all files from changelist "${item.changelist.name}"?`,
        { modal: true },
        'Confirm'
    );

    if (result !== 'Confirm') {
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
        vscode.window.showErrorMessage(`Failed to remove all files: ${error}`);
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
        vscode.window.showErrorMessage('Please select a changelist to add files to');
        return;
    }

    try {
        // Get all modified files
        const modifiedFiles = await getModifiedFiles(changelist.workspacePath);
        
        if (modifiedFiles.length === 0) {
            vscode.window.showInformationMessage('No modified files');
            return;
        }

        // Create QuickPick multi-select interface
        const quickPick = vscode.window.createQuickPick();
        quickPick.canSelectMany = true;
        quickPick.title = `Select files to add to changelist "${changelist.name}"`;
        quickPick.placeholder = 'Select files (multi-select)';
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
                    vscode.window.showErrorMessage(`Failed to add file to changelist: ${error}`);
                }
            }
        });

        quickPick.show();
    } catch (error) {
        vscode.window.showErrorMessage(`Error processing file: ${error}`);
    }
}

/**
 * Refresh all changelists status
 * Reload changelist manager status
 */
export function refreshChangelists(): void {
    ChangelistManager.getInstance().loadState();
} 