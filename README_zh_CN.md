# Git Toolkit
[![EN doc](https://img.shields.io/badge/document-English-blue.svg)](README.md)
[![CN doc](https://img.shields.io/badge/文档-中文版-blue.svg)](README_zh_CN.md)

一个用于简化Git操作的Visual Studio Code扩展，简化您的Git工作流程。

## 功能特性

### 1. 变更列表管理
- 创建和管理多个变更列表，主要用于本地调试时使配置文件的本地修改不被Git跟踪，就像IntelliJ IDEA的变更列表一样
- 使用了Git的skip-worktree功能
- 在源代码管理面板中直观地管理这些不需要提交的本地修改
- 支持有多个文件夹的工作区

### 2. Git提交压缩
- 通过可视化选择进行提交压缩

### 3. Git拉取变基
- 拉取远程代码并变基
- 拉取前自动暂存未提交的更改，拉取后自动恢复

## 系统要求
- Visual Studio Code 1.86.0 或更高版本
- 系统中已安装并配置Git

## 扩展设置
暂无

## 扩展命令

此扩展提供以下命令：
- `git-toolkit: Git Pull With Stash (Rebase)`: 执行Git变基拉取并自动暂存更改
- `git-toolkit: Git Squash Commits`: 交互式压缩多个提交

---

## 贡献
欢迎在我们的GitHub仓库提交问题和功能增强请求。

## 许可证
本扩展基于[LICENSE](LICENSE.txt)许可证。
