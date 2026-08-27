#!/bin/zsh

set -euo pipefail

# Use a project-only config directory while retaining the normal data directory,
# where OpenCode stores global provider credentials.
export XDG_CONFIG_HOME="${PWD}/.opencode/runtime/config"
export OPENCODE_DISABLE_EXTERNAL_SKILLS=1

exec opencode
