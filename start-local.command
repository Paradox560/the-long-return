#!/bin/zsh
set -e
cd "$(dirname "$0")"
export LONG_RETURN_DATA_DIR="$PWD/.long-return-local"
export PORT=4174
exec node game/local/server.mjs
