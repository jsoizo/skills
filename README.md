# skills

Agent skills that follow the [Agent Skills](https://agentskills.io) format. They work with any compatible agent, including Claude Code and Codex.

## Skills

| Skill | Description |
| --- | --- |
| [japanese-engineering-editor](skills/japanese-engineering-editor/SKILL.md) | Translate English engineering content into natural Japanese, or rewrite stiff, literal Japanese, while preserving technical meaning. |

## Layout

```text
skills/
└── <skill-name>/
    ├── SKILL.md        # required: frontmatter (name, description) + instructions
    ├── references/     # optional: docs loaded on demand
    └── agents/         # optional: agent-specific metadata (e.g. openai.yaml for Codex)
```

## Installation

With the [skills CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add jsoizo/skills
```

Or clone the repository and symlink a skill into your agent's skills directory:

```sh
git clone https://github.com/jsoizo/skills.git
mkdir -p ~/.agents/skills ~/.claude/skills
ln -s "$PWD/skills/skills/japanese-engineering-editor" ~/.agents/skills/japanese-engineering-editor
ln -s ../../.agents/skills/japanese-engineering-editor ~/.claude/skills/japanese-engineering-editor
```
