# Cyrune Host

Cyrune Host owns native messaging, filesystem and process authority, approved local bindings, secure credentials, and disk-backed Portal persistence.

Run `install.ps1` on Windows or `install.sh` on Linux/macOS to register the compatibility host ID `morpheus_webhub`. Mutable configuration defaults to `%LOCALAPPDATA%\Cyrune\Host\config.json` on Windows and `${XDG_CONFIG_HOME:-~/.config}/Cyrune/Host/config.json` elsewhere. Set `CYRUNE_HOST_CONFIG` for a portable or development override.

`config.example.json` documents the shape only. Never commit the live configuration because it contains device-local paths and approved bindings.

## Tests

```powershell
python -m pytest -q Host/tests
```
