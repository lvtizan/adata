#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$DIR/dev.sh"
