# Git Toolkit

A Visual Studio Code extension that enhances Git functionality with powerful features for managing changes and streamlining your Git workflow.

## Features

### 1. Changelist Management
- Create and manage multiple changelists to organize your changes
- Add/remove files to/from changelists
- Rename changelists
- Automatically track files using Git's skip-worktree feature
- View changelists in the Source Control panel
- Support for multiple Git workspaces

### 2. Git Squash Commits
- Interactive commit squashing with visual selection
- Multi-select commits to squash
- Preserves commit history and authorship information
- Supports all Git workspaces in your project

### 3. Git Pull Rebase
- Smart pull with rebase functionality
- Automatically stashes uncommitted changes
- Preserves local debug code during pull
- Handles multiple Git workspaces

## Requirements
- Visual Studio Code 1.x.x or higher
- Git installed and configured in your system

## Extension Settings
None

## Extension Commands

This extension contributes the following commands:

- `git-toolkit: Git pull with stash`: Perform a Git pull with automatic stashing of changes
- `git-toolkit: Git squash commits`: Interactively squash multiple commits

## Release Notes

### 1.0.0
- Initial release of Git Toolkit
- Added Changelist management features
- Added Git squash commits functionality
- Added Git pull rebase functionality

---

## Contributing
Feel free to submit issues and enhancement requests on our GitHub repository.

## License
This extension is licensed under the [LICENSE](LICENSE.txt).
