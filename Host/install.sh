#!/usr/bin/env bash
# Cyrune Host — native messaging installer (Linux / macOS)
# Run from the Host/ directory:
#   bash install.sh
# Optional for temporary/debug add-ons:
#   bash install.sh morpheus-webhub@local '<temporary-id>'

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWED_EXTENSIONS=("$@")
if [ ${#ALLOWED_EXTENSIONS[@]} -eq 0 ]; then
    ALLOWED_EXTENSIONS=("morpheus-webhub@local")
fi

echo "Cyrune Host installer"
echo ""

# --- Find Python ---
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PYTHON=$(command -v "$cmd")
        break
    fi
done
if [ -z "$PYTHON" ]; then
    echo "ERROR: Python 3 not found. Install Python 3 and ensure it is in PATH."
    exit 1
fi
echo "Python  : $PYTHON"
echo "Allowed : ${ALLOWED_EXTENSIONS[*]}"

ALLOWED_JSON=$(printf '%s\n' "${ALLOWED_EXTENSIONS[@]}" | "$PYTHON" -c 'import json,sys; print(json.dumps([line.strip() for line in sys.stdin if line.strip()]))')

HOST="$SCRIPT_DIR/morpheus_host.py"
COMPONENT_VERSION=$("$PYTHON" -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' "$SCRIPT_DIR/component.json")
echo "Version : $COMPONENT_VERSION"
chmod +x "$HOST"

# --- Write default external config.json if missing ---
CONFIG_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/Cyrune/Host"
CONFIG="$CONFIG_ROOT/config.json"
mkdir -p "$CONFIG_ROOT"
if [ ! -f "$CONFIG" ]; then
cat > "$CONFIG" <<JSON
{
  "databasePath": "",
  "arcadeRoot": "",
  "emuguiRoot": "",
  "approvedDirectories": {},
  "approvedApplications": {},
  "approvedGames": {}
}
JSON
    echo "Config  : $CONFIG"
else
    echo "Config  : $CONFIG (existing)"
fi

# --- Write manifest ---
if [[ "$OSTYPE" == "darwin"* ]]; then
    MANIFEST_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
else
    MANIFEST_DIR="$HOME/.mozilla/native-messaging-hosts"
fi

mkdir -p "$MANIFEST_DIR"
MANIFEST="$MANIFEST_DIR/morpheus_webhub.json"

cat > "$MANIFEST" <<JSON
{
  "name": "morpheus_webhub",
  "description": "Cyrune Host $COMPONENT_VERSION",
  "path": "$HOST",
  "type": "stdio",
  "allowed_extensions": $ALLOWED_JSON
}
JSON

echo "Manifest: $MANIFEST"
echo ""
echo "Installation complete."
echo "Restart Firefox to activate the native host."
