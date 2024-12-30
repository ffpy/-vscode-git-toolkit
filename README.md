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

## Release Notes

### 1.0.0
- Initial release of Git Toolkit
- Added Changelist management features
- Added Git squash commits functionality
- Added Git pull rebase functionality

### 1.0.1
- Modified command names
- Fixed `Git Squash Commits` cannot handle multi-line commit messages
- Added warning message when attempting to add untracked files to changelist

---

## Contributing
Feel free to submit issues and enhancement requests on our GitHub repository.

## License
This extension is licensed under the [LICENSE](LICENSE.txt).
