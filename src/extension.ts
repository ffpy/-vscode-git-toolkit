// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { initOutputChannel } from './utils';
import { gitSquashCommits } from './command/gitSquashCommits';
import { gitPullRebase } from './command/gitPullRebase';
import { ChangelistManager } from './model/changelist';
import { ChangelistTreeDataProvider } from './view/changelistView';
import { 
	addChangelist,
	removeChangelist,
	renameChangelist,
	addToChangelist,
	removeFromChangelist,
	removeAllFromChangelist,
	addStagedToChangelist,
	refreshChangelists
} from './command/gitChangelist';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Initialize l10n configuration
 * @param extensionPath The path to the extension
 */
function initL10n(extensionPath: string) {
	const l10nDir = path.join(extensionPath, 'l10n');
	try {
		// Read all json files in l10n directory
		const files = fs.readdirSync(l10nDir).filter(file => file.endsWith('.json'));
		const contents: { [key: string]: any } = {};
		
		// Merge all json files
		for (const file of files) {
			const filePath = path.join(l10nDir, file);
			const fileContent = fs.readFileSync(filePath, 'utf-8');
			Object.assign(contents, JSON.parse(fileContent));
		}

		l10n.config({ contents });
	} catch (e) {
		console.error('Failed to configure l10n:', e);
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Initialize l10n
	initL10n(context.extensionPath);

	// Initialize output channel
	initOutputChannel(context);

	// Register Git related commands
	let gitPullRebaseCommand = vscode.commands.registerCommand('git-toolkit.gitPullRebase', gitPullRebase);
	let squashCommitsCommand = vscode.commands.registerCommand('git-toolkit.gitSquashCommits', gitSquashCommits);

	// Register Changelist related commands
	let addChangelistCommand = vscode.commands.registerCommand('git-toolkit.addChangelist', addChangelist);
	let removeChangelistCommand = vscode.commands.registerCommand('git-toolkit.removeChangelist', removeChangelist);
	let renameChangelistCommand = vscode.commands.registerCommand('git-toolkit.renameChangelist', renameChangelist);
	let addToChangelistCommand = vscode.commands.registerCommand('git-toolkit.addToChangelist', addToChangelist);
	let removeFromChangelistCommand = vscode.commands.registerCommand('git-toolkit.removeFromChangelist', removeFromChangelist);
	let removeAllFromChangelistCommand = vscode.commands.registerCommand('git-toolkit.removeAllFromChangelist', removeAllFromChangelist);
	let addStagedToChangelistCommand = vscode.commands.registerCommand('git-toolkit.addStagedToChangelist', addStagedToChangelist);
	let refreshChangelistsCommand = vscode.commands.registerCommand('git-toolkit.refreshChangelists', refreshChangelists);

	// Register Changelist view
	const changelistTreeDataProvider = new ChangelistTreeDataProvider(ChangelistManager.getInstance());
	vscode.window.registerTreeDataProvider('git-toolkit-changelists', changelistTreeDataProvider);

	// Register all commands to subscription list
	context.subscriptions.push(
		gitPullRebaseCommand,
		squashCommitsCommand,
		addChangelistCommand,
		removeChangelistCommand,
		renameChangelistCommand,
		addToChangelistCommand,
		removeFromChangelistCommand,
		removeAllFromChangelistCommand,
		addStagedToChangelistCommand,
		refreshChangelistsCommand
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
