import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { log, execCommand, getSkipWorktreeFiles, getGitWorkspaceFolders, clearGitRepoCache } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';

/** Default changelist name */
export const DEFAULT_CHANGELIST_NAME = 'Default';

/**
 * File item in the changelist
 */
export interface ChangelistItem {
    /** File path (relative to workspace) */
    path: string;
    /** Workspace path */
    workspacePath: string;
}

/**
 * Data structure for serializing changelists
 */
interface SerializedChangelist {
    /** Changelist name */
    name: string;
    /** File items in the changelist */
    items: string[];
}

/**
 * Complete data structure for serialization
 */
interface SerializedData {
    /** All changelists */
    changelists: SerializedChangelist[];
}

/**
 * Changelist class, used to manage a group of files that need to be ignored by git
 */
export class Changelist {
    constructor(
        /** Changelist name */
        public readonly name: string,
        /** Workspace path */
        public readonly workspacePath: string,
        /** File items in the changelist */
        public readonly items: ChangelistItem[] = []
    ) {}

    /**
     * Add file to changelist
     * @param path File path (relative to workspace)
     */
    async addFile(path: string): Promise<void> {
        if (!this.items.find(item => item.path === path)) {
            this.items.push({ path, workspacePath: this.workspacePath });
            await this.updateGitIndex(path, true);
            await ChangelistManager.getInstance().saveState(this.workspacePath);
        }
    }

    /**
     * Remove file from changelist
     * @param path File path (relative to workspace)
     */
    async removeFile(path: string): Promise<void> {
        const index = this.items.findIndex(item => item.path === path);
        if (index !== -1) {
            this.items.splice(index, 1);
            await this.updateGitIndex(path, false);
            await ChangelistManager.getInstance().saveState(this.workspacePath);
        }
    }

    /**
     * Update git index status of file
     * @param path File path
     * @param skip Whether to ignore file
     */
    private async updateGitIndex(path: string, skip: boolean): Promise<void> {
        try {
            const args = skip 
                ? ['update-index', '--skip-worktree', path]
                : ['update-index', '--no-skip-worktree', path];
            
            await execCommand('git', args, this.workspacePath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(l10n.t('git-toolkit.changelist.failedToUpdateGitIndex', { path, error: errorMessage }));
            throw error;
        }
    }

    /**
     * Convert changelist to serializable format
     */
    toJSON(): SerializedChangelist {
        return {
            name: this.name,
            items: this.items.map(item => item.path)
        };
    }
}

/**
 * Changelist manager, used to manage all changelists
 * Uses singleton pattern to ensure only one instance exists globally
 */
export class ChangelistManager {
    private static instance: ChangelistManager;
    /** Stores all changelists, key is "workspacePath:changelistName" */
    private readonly changelists: Map<string, Changelist> = new Map();
    /** Changelist change event emitter */
    private readonly _onDidChangeChangelists = new vscode.EventEmitter<void>();
    /** Changelist change event */
    readonly onDidChangeChangelists = this._onDidChangeChangelists.event;

    private constructor() {
        log(l10n.t('git-toolkit.changelist.initializing'));
        // Initialize and load state
        this.loadState().then(() => {
            this._onDidChangeChangelists.fire();
        });
    }

    /**
     * Get changelist key
     */
    private getChangelistKey(workspacePath: string, name: string): string {
        return `${workspacePath}:${name}`;
    }

    /**
     * Get workspace configuration file path
     */
    private getConfigPath(workspacePath: string): string {
        return path.join(workspacePath, '.vscode', 'changelists.json');
    }

    /**
     * Get ChangelistManager singleton instance
     */
    static getInstance(): ChangelistManager {
        if (!ChangelistManager.instance) {
            ChangelistManager.instance = new ChangelistManager();
        }
        return ChangelistManager.instance;
    }

    /**
     * Get all changelists
     * @param workspacePath Optional workspace path, if provided only return changelists for that workspace
     */
    getChangelists(workspacePath?: string): Changelist[] {
        let changelists = Array.from(this.changelists.values());
        
        // If a workspace path is specified, only return changelists for that workspace
        if (workspacePath) {
            changelists = changelists.filter(cl => cl.workspacePath === workspacePath);
        }

        // Sort by rule:
        // 1. Default changelist is fixed at the top
        // 2. Other changelists are sorted alphabetically
        return changelists.sort((a, b) => {
            if (a.name === DEFAULT_CHANGELIST_NAME) return -1;
            if (b.name === DEFAULT_CHANGELIST_NAME) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    /**
     * Get changelist by name
     * @param name Changelist name
     * @param workspacePath Workspace path
     */
    getChangelist(name: string, workspacePath: string): Changelist | undefined {
        return this.changelists.get(this.getChangelistKey(workspacePath, name));
    }

    /**
     * Add new changelist
     * @param name Changelist name
     * @param workspacePath Workspace path
     */
    async addChangelist(name: string, workspacePath: string): Promise<void> {
        const key = this.getChangelistKey(workspacePath, name);
        if (!this.changelists.has(key)) {
            this.changelists.set(key, new Changelist(name, workspacePath));
            this._onDidChangeChangelists.fire();
            await this.saveState(workspacePath);
        }
    }

    /**
     * Remove changelist
     * @param name Changelist name
     * @param workspacePath Workspace path
     * @throws If trying to remove ${DEFAULT_CHANGELIST_NAME} changelist
     */
    async removeChangelist(name: string, workspacePath: string): Promise<void> {
        if (name === DEFAULT_CHANGELIST_NAME) {
            throw new Error(l10n.t('git-toolkit.changelist.cannotRemoveDefault', { name: DEFAULT_CHANGELIST_NAME }));
        }
        const key = this.getChangelistKey(workspacePath, name);
        const changelist = this.changelists.get(key);
        if (changelist) {
            // Remove all files from git index before removing changelist
            const files = [...changelist.items.map(item => item.path)];
            for (const file of files) {
                await changelist.removeFile(file);
            }
            this.changelists.delete(key);
            this._onDidChangeChangelists.fire();
            await this.saveState(workspacePath);
        }
    }

    /**
     * Rename changelist
     * @param oldName Original changelist name
     * @param newName New changelist name
     * @param workspacePath Workspace path
     * @throws If trying to rename ${DEFAULT_CHANGELIST_NAME} changelist or new name already exists
     */
    async renameChangelist(oldName: string, newName: string, workspacePath: string): Promise<void> {
        if (oldName === DEFAULT_CHANGELIST_NAME) {
            throw new Error(l10n.t('git-toolkit.changelist.cannotRenameDefault', { name: DEFAULT_CHANGELIST_NAME }));
        }
        const newKey = this.getChangelistKey(workspacePath, newName);
        if (this.changelists.has(newKey)) {
            throw new Error(l10n.t('git-toolkit.changelist.nameAlreadyExists'));
        }
        const oldKey = this.getChangelistKey(workspacePath, oldName);
        const changelist = this.changelists.get(oldKey);
        if (changelist) {
            this.changelists.delete(oldKey);
            this.changelists.set(newKey, new Changelist(newName, workspacePath, changelist.items));
            this._onDidChangeChangelists.fire();
            await this.saveState(workspacePath);
        }
    }

    /**
     * Save changelist state to configuration file
     * @param workspacePath Workspace path
     */
    async saveState(workspacePath: string): Promise<void> {
        try {
            const configPath = this.getConfigPath(workspacePath);
            const vscodeDir = path.dirname(configPath);
            await fs.mkdir(vscodeDir, { recursive: true });

            const changelists = this.getChangelists(workspacePath);
            const data: SerializedData = {
                changelists: changelists.map(cl => cl.toJSON())
            };
            await fs.writeFile(configPath, JSON.stringify(data, null, 2));
            
            // Trigger update event
            this._onDidChangeChangelists.fire();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(l10n.t('git-toolkit.changelist.failedToSaveState', { workspace: workspacePath, error: errorMessage }));
        }
    }

    /**
     * Load serialized data from configuration file
     * @param workspacePath Workspace path
     */
    private async loadSerializedData(workspacePath: string): Promise<SerializedData> {
        const configPath = this.getConfigPath(workspacePath);
        try {
            const content = await fs.readFile(configPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            // If file doesn't exist or parsing fails, use default configuration
            return { changelists: [{ name: DEFAULT_CHANGELIST_NAME, items: [] }] };
        }
    }

    /**
     * Clear all changelists for workspaces except Default
     */
    private clearNonDefaultChangelists(workspacePath: string): void {
        for (const [key, changelist] of this.changelists.entries()) {
            if (changelist.workspacePath === workspacePath && changelist.name !== DEFAULT_CHANGELIST_NAME) {
                this.changelists.delete(key);
            }
        }
    }

    /**
     * Sync changelists with actual git ignored files
     */
    private async syncChangelistsWithGit(
        workspacePath: string,
        data: SerializedData,
        actualSkippedFiles: string[]
    ): Promise<{ hasNewFiles: boolean; hasRemovedFiles: boolean }> {
        const processedFiles = new Set<string>();
        let hasRemovedFiles = false;

        // Sync existing changelists
        for (const cl of data.changelists) {
            const originalItemCount = cl.items.length;
            const validItems = cl.items.filter(path => {
                const isActuallySkipped = actualSkippedFiles.includes(path);
                if (isActuallySkipped) {
                    processedFiles.add(path);
                }
                return isActuallySkipped;
            });

            if (validItems.length < originalItemCount) {
                hasRemovedFiles = true;
            }

            const key = this.getChangelistKey(workspacePath, cl.name);
            if (cl.name !== DEFAULT_CHANGELIST_NAME) {
                this.changelists.set(key, new Changelist(cl.name, workspacePath, 
                    validItems.map(path => ({ path, workspacePath }))));
            } else {
                const defaultList = this.changelists.get(key);
                if (defaultList) {
                    defaultList.items.length = 0;
                    defaultList.items.push(...validItems.map(path => ({ path, workspacePath })));
                }
            }
        }

        // Handle unassigned ignored files
        const defaultKey = this.getChangelistKey(workspacePath, DEFAULT_CHANGELIST_NAME);
        const defaultList = this.changelists.get(defaultKey);
        if (!defaultList) {
            // If default changelist doesn't exist, create it
            this.changelists.set(defaultKey, new Changelist(DEFAULT_CHANGELIST_NAME, workspacePath));
        }

        const unprocessedFiles = actualSkippedFiles.filter(file => !processedFiles.has(file));
        const hasNewFiles = unprocessedFiles.length > 0;

        if (hasNewFiles) {
            const defaultList = this.changelists.get(defaultKey)!;
            for (const file of unprocessedFiles) {
                defaultList.items.push({ path: file, workspacePath });
            }
        }

        return { hasNewFiles, hasRemovedFiles };
    }

    /**
     * Load changelist state
     */
    async loadState(): Promise<void> {
        try {
            // Clear Git repository cache
            clearGitRepoCache();

            // Get all Git repository workspaces
            const gitWorkspaceFolders = await getGitWorkspaceFolders();
            if (gitWorkspaceFolders.length === 0) {
                return;
            }

            // Clear all existing changelists
            this.changelists.clear();

            // Load state for each workspace separately
            for (const folder of gitWorkspaceFolders) {
                await this.loadWorkspaceState(folder.uri.fsPath);
            }

            this._onDidChangeChangelists.fire();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(l10n.t('git-toolkit.changelist.failedToLoadState', { error: errorMessage }));
        }
    }

    /**
     * Load changelist state for specified workspace
     * @param workspacePath Workspace path
     */
    private async loadWorkspaceState(workspacePath: string): Promise<void> {
        try {
            // Create default changelist for workspace
            const defaultKey = this.getChangelistKey(workspacePath, DEFAULT_CHANGELIST_NAME);
            this.changelists.set(defaultKey, new Changelist(DEFAULT_CHANGELIST_NAME, workspacePath));

            // Get list of files actually ignored by git
            const actualSkippedFiles = await getSkipWorktreeFiles(workspacePath);

            // Load configuration file data
            const data = await this.loadSerializedData(workspacePath);

            // Sync changelist state
            const { hasNewFiles, hasRemovedFiles } = await this.syncChangelistsWithGit(
                workspacePath,
                data,
                actualSkippedFiles
            );

            // Save updates if state has changed
            if (hasNewFiles || hasRemovedFiles) {
                await this.saveState(workspacePath);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log(l10n.t('git-toolkit.changelist.failedToLoadWorkspaceState', { workspace: workspacePath, error: errorMessage }));
            throw error;
        }
    }
} 