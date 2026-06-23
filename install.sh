#!/usr/bin/env bash
# saga-smell installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/johncoleman-thoughtworks/saga-smell-skill/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/johncoleman-thoughtworks/saga-smell-skill/main/install.sh | bash -s -- --project

set -euo pipefail

REPO="https://github.com/johncoleman-thoughtworks/saga-smell-skill"
RAW="https://raw.githubusercontent.com/johncoleman-thoughtworks/saga-smell-skill/main"
SKILL_NAME="saga-smell"
PROJECT=false

for arg in "$@"; do
  case $arg in
    --project) PROJECT=true ;;
    --help)
      echo "Usage: install.sh [--project]"
      echo "  (no flag)   install to ~/.claude/skills/ (all projects)"
      echo "  --project   install to .claude/skills/   (this project only)"
      exit 0 ;;
  esac
done

if $PROJECT; then
  SKILLS_DIR=".claude/skills"
  WORKFLOWS_DIR=".claude/workflows"
  COMMANDS_DIR=".claude/commands"
  echo "Installing saga-smell skill to project scope ($SKILLS_DIR)..."
else
  SKILLS_DIR="$HOME/.claude/skills"
  WORKFLOWS_DIR="$HOME/.claude/workflows"
  COMMANDS_DIR="$HOME/.claude/commands"
  echo "Installing saga-smell skill to user scope ($SKILLS_DIR)..."
fi

mkdir -p "$SKILLS_DIR/$SKILL_NAME"
mkdir -p "$WORKFLOWS_DIR"

# Download skill file (single-file / pasted-code analysis)
curl -fsSL "$RAW/skills/saga-smell/SKILL.md" \
  -o "$SKILLS_DIR/$SKILL_NAME/SKILL.md"

# Download workflow (whole-codebase multi-agent scan)
curl -fsSL "$RAW/.claude/workflows/saga-smell.js" \
  -o "$WORKFLOWS_DIR/saga-smell.js"

echo ""
echo "✓ Skill installed to $SKILLS_DIR/$SKILL_NAME/"
echo "✓ Workflow installed to $WORKFLOWS_DIR/saga-smell.js"
echo ""
echo "Usage in Claude Code:"
echo "  /saga-smell src/services/orderService.ts   # single file"
echo "  /saga-smell the processPayment function     # pasted code"
echo "  Or just ask: 'review this for saga smells'"
echo ""
echo "For whole-codebase scans (multi-agent, exhaustive):"
echo "  Ask Claude: 'run the saga-smell workflow on ./src'"
echo "  Or: 'saga smell deep scan of this codebase'"
echo ""
echo "To also install the slash command:"
if $PROJECT; then
  echo "  mkdir -p .claude/commands"
  echo "  curl -fsSL $RAW/.claude/commands/saga-smell.md -o .claude/commands/saga-smell.md"
else
  echo "  mkdir -p ~/.claude/commands"
  echo "  curl -fsSL $RAW/.claude/commands/saga-smell.md -o ~/.claude/commands/saga-smell.md"
fi
