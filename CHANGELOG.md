# Change Log

All notable changes to the "git-toolkit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.1.1] - 2025-01-27
### Changed
- Changed changelist configuration file location from `.vscode/changelists.json` to `.git/info/changelists.json`
- Improve squash commits validation and UX

## [1.1.0] - 2025-01-12
### Added
- Added Git pull rebase and squash commits buttons to SCM title
- Added stash/unstash support for changelists
- Added diff view for files in changelist

### Changed
- Enhanced squash commits feature to support multiple commits

## [1.0.1] - 2024-12-30
### Changed
- Modified command names

### Fixed
- Fixed `Git Squash Commits` cannot handle multi-line commit messages
- Added warning message when attempting to add untracked files to changelist

## [1.0.0] - 2024-12-29
### Added
- Initial release of Git Toolkit
- Added Changelist management features
- Added Git squash commits functionality
- Added Git pull rebase functionality