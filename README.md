# Git Toolkit

[![EN doc](https://img.shields.io/badge/document-English-blue.svg)](README.md)
[![CN doc](https://img.shields.io/badge/文档-中文版-blue.svg)](README_zh_CN.md)

A Visual Studio Code extension that simplifies Git operations and streamlines your Git workflow.

## Features

### 1. Changelist Management
- Create and manage multiple changelists, primarily used to prevent Git from tracking local modifications to configuration files during debugging, similar to IntelliJ IDEA's changelist feature
- Utilizes Git's skip-worktree functionality
- Intuitively manage local modifications that don't need to be committed in the Source Control panel
- Support for workspaces with multiple folders

### 2. Git Squash Commits
- Interactive commit squashing with visual selection

### 3. Git Pull Rebase
- Pull remote code with rebase
- Automatically stash uncommitted changes before pulling and restore them afterward

## Requirements
- Visual Studio Code 1.86.0 or higher
- Git installed and configured in your system

## Extension Settings
None

## Extension Commands

This extension contributes the following commands:
- `git-toolkit: Git Pull With Stash (Rebase)`: Perform a Git pull rebase with automatic stashing of changes
- `git-toolkit: Git Squash Commits`: Interactively squash multiple commits

---

## Contributing
Feel free to submit issues and enhancement requests on our GitHub repository.

## License
This extension is licensed under the [LICENSE](LICENSE.txt).
