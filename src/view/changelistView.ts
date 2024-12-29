import * as vscode from 'vscode';
import { Changelist, ChangelistManager, DEFAULT_CHANGELIST_NAME } from '../model/changelist';
import { getGitWorkspaceFolders } from '../utils';

/**
 * Changelist Tree View Item
 * Used to display changelists and files in VS Code's Source Control panel
 */
export class ChangelistTreeItem extends vscode.TreeItem {
    constructor(
        /** Associated changelist */
        public readonly changelist?: Changelist,
        /** File path if this is a file item; otherwise undefined */
        public readonly file?: string,
        /** Workspace folder */
        public readonly workspaceFolder?: vscode.WorkspaceFolder
    ) {
        super(
            file ?? changelist?.name ?? workspaceFolder?.name ?? '',
            file ? vscode.TreeItemCollapsibleState.None : 
                workspaceFolder ? vscode.TreeItemCollapsibleState.Expanded :
                vscode.TreeItemCollapsibleState.Expanded
        );

        if (file) {
            // Configuration for file items
            this.contextValue = 'file';
            this.iconPath = new vscode.ThemeIcon('file');
        } else if (workspaceFolder) {
            // Configuration for workspace folder items
            this.contextValue = 'workspaceFolder';
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (changelist) {
            // Configuration for changelist items
            this.contextValue = changelist.name === DEFAULT_CHANGELIST_NAME ? 'defaultChangelist' : 'changelist';
            this.iconPath = new vscode.ThemeIcon('list-unordered');
            this.description = `${changelist.items.length} files`;
        }
    }
}

/**
 * Changelist Tree View Data Provider
 * Used to manage the display of changelists in VS Code's Source Control panel
 */
export class ChangelistTreeDataProvider implements vscode.TreeDataProvider<ChangelistTreeItem> {
    /** Tree view data change event emitter */
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ChangelistTreeItem | undefined>();
    /** Tree view data change event */
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        /** Changelist manager instance */
        private readonly changelistManager: ChangelistManager
    ) {
        // Listen for changelist change events
        this.changelistManager.onDidChangeChangelists(() => {
            this.refresh();
        });
    }

    /**
     * Refresh tree view
     */
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Get tree view item
     * @param element Tree view item
     */
    getTreeItem(element: ChangelistTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get child items
     * @param element Parent item, if undefined get root items
     */
    async getChildren(element?: ChangelistTreeItem): Promise<ChangelistTreeItem[]> {
        if (!element) {
            // Root level - Get workspace folders for all Git repositories
            const gitWorkspaceFolders = await getGitWorkspaceFolders();
            
            if (gitWorkspaceFolders.length === 0) {
                return [];
            } else if (gitWorkspaceFolders.length === 1) {
                // When there's only one Git repository, directly show changelists
                const changelists = this.changelistManager.getChangelists(gitWorkspaceFolders[0].uri.fsPath);
                return changelists.map(changelist => new ChangelistTreeItem(changelist));
            } else {
                // When there are multiple Git repositories, show workspace folder list
                return gitWorkspaceFolders.map(folder => new ChangelistTreeItem(undefined, undefined, folder));
            }
        } else if (element.workspaceFolder) {
            // Workspace level - Show changelists under this workspace
            const changelists = this.changelistManager.getChangelists(element.workspaceFolder.uri.fsPath);
            return changelists.map(changelist => new ChangelistTreeItem(changelist));
        } else if (element.changelist) {
            // Changelist level - Show files
            return element.changelist.items.map(item => new ChangelistTreeItem(element.changelist, item.path));
        }
        return [];
    }
} 