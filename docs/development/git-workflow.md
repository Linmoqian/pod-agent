# Git 工作流规范

## 开始前

- 运行 `git status --short --branch`，确认分支与已有改动。
- 禁止覆盖、清理或格式化无关改动；文件已有修改时只做最小增量编辑。
- 禁止使用 `git reset --hard`、`git clean -fd`、`git restore .`、`git checkout -- .` 和强制推送。

## 分支与提交

- `main` 保持可运行；功能使用 `feat/`，修复使用 `fix/`，文档使用 `docs/`。
- 一个提交只承载一个可验证的语义单元。
- 暂存使用明确路径或 `git add -p`，不用 `git add .` 或 `git add -A`。
- 暂存后检查 `git diff --cached`，排除密钥、运行时数据、构建产物和无关文件。
- 提交信息使用中文 Conventional Commits，例如 `docs(roadmap): 明确初代演示验收范围`。
- 推送、创建/合并 PR、标签、发布和部署必须取得工程师明确确认。

## 完成顺序

```text
讨论与设计 → 最小实现 → 验证 → 检查差异 → 精准暂存 → 本地提交 → 经确认后推送
```
