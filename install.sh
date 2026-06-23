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
  echo "Installing saga-smell skill to project scope ($SKILLS_DIR)..."
else
  SKILLS_DIR="$HOME/.claude/skills"
  echo "Installing saga-smell skill to user scope ($SKILLS_DIR)..."
fi

mkdir -p "$SKILLS_DIR/$SKILL_NAME"

# Download skill file
curl -fsSL "$RAW/skills/saga-smell/SKILL.md" \
  -o "$SKILLS_DIR/$SKILL_NAME/SKILL.md"

echo ""
echo "✓ Skill installed to $SKILLS_DIR/$SKILL_NAME/"
echo ""
echo "Usage in Claude Code:"
echo "  /saga-smell src/services/orderService.ts"
echo "  /saga-smell the processPayment function"
echo "  Or just ask: 'review this for saga smells'"
echo ""
echo "To also install the slash command:"
if $PROJECT; then
  echo "  mkdir -p .claude/commands"
  echo "  curl -fsSL $RAW/.claude/commands/saga-smell.md -o .claude/commands/saga-smell.md"
else
  echo "  mkdir -p ~/.claude/commands"
  echo "  curl -fsSL $RAW/.claude/commands/saga-smell.md -o ~/.claude/commands/saga-smell.md"
fi
