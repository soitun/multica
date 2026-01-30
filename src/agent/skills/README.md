# Skills System

Skills extend agent capabilities through `SKILL.md` definition files.

## Table of Contents

- [SKILL.md Specification](#skillmd-specification)
- [Loading & Precedence](#loading--precedence)
- [CLI Commands](#cli-commands)

---

## SKILL.md Specification

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter + Markdown content.

### Basic Structure

```markdown
---
name: My Skill
version: 1.0.0
description: What this skill does
metadata:
  emoji: "🔧"
  requires:
    bins: [git]
---

# Instructions

Detailed instructions injected into the agent's system prompt...
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `version` | string | No | Version number |
| `description` | string | No | Short description |
| `homepage` | string | No | Homepage URL |
| `metadata` | object | No | See below |
| `config` | object | No | See below |
| `install` | array | No | See below |

### metadata.requires

Defines eligibility requirements:

```yaml
metadata:
  emoji: "📝"
  requires:
    bins: [git, node]        # All must exist
    anyBins: [npm, pnpm]     # At least one must exist
    env: [API_KEY]           # All must be set
    platforms: [darwin, linux]  # Current OS must match
```

| Field | Description |
|-------|-------------|
| `bins` | Required binaries (all must exist in PATH) |
| `anyBins` | Alternative binaries (at least one must exist) |
| `env` | Required environment variables |
| `platforms` | Supported platforms: `darwin`, `linux`, `win32` |

### config

Runtime configuration options:

```yaml
config:
  enabled: true
  requiresConfig: ["skills.myskill.apiKey"]
  options:
    timeout: 30000
```

### install

Dependency installation specifications:

```yaml
install:
  - kind: brew
    package: jq

  - kind: npm
    package: typescript
    global: true

  - kind: uv
    package: requests

  - kind: go
    package: github.com/example/tool@latest

  - kind: download
    url: https://example.com/tool.tar.gz
    archiveType: tar.gz
    stripComponents: 1
```

**Supported install kinds:**

| Kind | Description | Key Fields |
|------|-------------|------------|
| `brew` | Homebrew | `package`, `cask` |
| `npm` | npm/pnpm/yarn | `package`, `global` |
| `uv` | Python uv | `package` |
| `go` | Go install | `package` |
| `download` | Download & extract | `url`, `archiveType` |

**Common fields:** `id`, `label`, `platforms`, `when`

---

## Loading & Precedence

Skills load from multiple sources with precedence (lowest to highest):

| Priority | Source | Path | Description |
|----------|--------|------|-------------|
| 1 | bundled | `<project>/skills/` | Built-in skills |
| 2 | extraDirs | Configured | Additional directories |
| 3 | managed | `~/.super-multica/skills/` | CLI-installed skills |
| 4 | profile | `~/.super-multica/agent-profiles/<id>/skills/` | Profile-specific |

Higher priority sources override skills with the same ID.

### Eligibility Filtering

After loading, skills are filtered by:

1. Platform check (`platforms`)
2. Binary check (`bins`, `anyBins`)
3. Environment check (`env`)
4. Config check (`requiresConfig`)
5. Enabled check (`config.enabled`)

Only skills passing all checks are marked as eligible.

---

## CLI Commands

### List Skills

```bash
pnpm skills:cli list           # List all skills
pnpm skills:cli list -v        # Verbose mode
pnpm skills:cli status         # Summary status
pnpm skills:cli status <id>    # Specific skill status
```

### Install from GitHub

**Example: Installing from [anthropics/skills](https://github.com/anthropics/skills)**

The repository structure:
```
anthropics/skills/
├── skills/
│   ├── algorithmic-art/
│   │   └── SKILL.md
│   ├── brand-guidelines/
│   │   └── SKILL.md
│   ├── pdf/
│   │   └── SKILL.md
│   └── ... (16 skills total)
```

Install the entire repository (all 16 skills):
```bash
pnpm skills:cli add anthropics/skills
# Installs to: ~/.super-multica/skills/skills/
# All skills available: algorithmic-art, brand-guidelines, pdf, etc.
```

Install a single skill only:
```bash
pnpm skills:cli add anthropics/skills/skills/pdf
# Installs to: ~/.super-multica/skills/pdf/
# Only the pdf skill is installed
```

Install from a specific branch or tag:
```bash
pnpm skills:cli add anthropics/skills@main
```

Using full URL:
```bash
pnpm skills:cli add https://github.com/anthropics/skills
pnpm skills:cli add https://github.com/anthropics/skills/tree/main/skills/pdf
```

Force overwrite existing:
```bash
pnpm skills:cli add anthropics/skills --force
```

**Supported formats:**

| Format | Example | Description |
|--------|---------|-------------|
| `owner/repo` | `anthropics/skills` | Clone entire repository |
| `owner/repo/path` | `anthropics/skills/skills/pdf` | Single directory (sparse checkout) |
| `owner/repo@ref` | `anthropics/skills@v1.0.0` | Specific branch or tag |
| Full URL | `https://github.com/anthropics/skills` | GitHub URL |
| Full URL + path | `https://github.com/.../tree/main/skills/pdf` | URL with specific path |

### Remove Skills

```bash
pnpm skills:cli remove <name>   # Remove installed skill
pnpm skills:cli remove          # List installed skills
```

### Install Dependencies

```bash
pnpm skills:cli install <id>              # Install skill dependencies
pnpm skills:cli install <id> <install-id> # Specific install option
```

---

## Troubleshooting

**Skill not showing as eligible?**

Run `pnpm skills:cli status <skill-id>` to see the specific reason.

**Override a bundled skill?**

Create a skill with the same ID in `~/.super-multica/skills/` or profile skills directory.

**Hot reload not working?**

Ensure `chokidar` is installed: `pnpm add chokidar`
