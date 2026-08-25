# Cyrune Host

Cyrune Host owns native messaging, filesystem and process authority, approved local bindings, secure credentials, and disk-backed Portal persistence.

During the current migration its tracked implementation remains under `../Relay/native/`. It will move here only with updated installers, manifests, tests, rollback instructions, and a verified browser reinstallation.

## Tests

```powershell
python -m pytest -q Host/tests
```
