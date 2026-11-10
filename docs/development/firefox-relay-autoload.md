# Firefox development autoload and recovery

Recorded 2026-11-10. This machine uses Firefox AutoConfig to load the unpackaged
Cyrune Relay extension automatically at each normal Firefox startup. It avoids
manually selecting **Load Temporary Add-on** during development; it does not
produce a permanent or Mozilla-signed extension installation.

## Verified setup

- Firefox installation: `C:\Program Files\Mozilla Firefox`.
- Default target profile: `C:\Users\chris\AppData\Roaming\Mozilla\Firefox\Profiles\qwee2l58.default-release`.
- Extension source: `F:\Projects\Coding\Cyrune\Relay`.
- Preserved Gecko ID: `morpheus-webhub@local` (a compatibility identifier).
- Verified Relay version: 1.6.6, using the installed Firefox 160.0 in an isolated
  profile. Earlier tests also passed with a disposable copy of Firefox 159.0.1,
  including repeated startups. The user subsequently confirmed automatic loading
  in the normal profile after updating Firefox.

The loader waits for `final-ui-startup`, uses current `.sys.mjs` imports, and calls
`AddonManager.installTemporaryAddon()` on the Relay directory. It skips Firefox
Troubleshoot Mode and leaves an existing permanent installation with the same ID
in place. Each startup reads the current extension source; edits made while
Firefox is running require **Reload** in `about:debugging#/runtime/this-firefox`
or a complete browser restart.

The setup requires administrator access and disables **the AutoConfig sandbox**
to run privileged startup JavaScript. It does not disable the web-content sandbox
or change extension-signature preferences. Treat the loader and the Relay source
directory as trusted executable code. The user explicitly approved this setup.
These files remain outside the checkout and outside the Relay XPI payload.

## Installed files and restore contents

Two custom files under the Firefox installation are sufficient to reconstruct the
setup. The snippets below are the restore reference; they do not depend on the
original temporary installer or test artifacts.

The existing Bitdefender files `defaults\pref\bd_js_config.js` and `bd_config.cfg`
remain untouched. During testing, Bitdefender restored its own `.cfg`, discarding
an appended loader, so Cyrune uses a separate config file. The Cyrune config
preserves the existing `security.enterprise_roots.enabled` lock. Firefox selects
one AutoConfig filename: if another managed AutoConfig is added or changed later,
review and reconcile its requirements rather than simply overriding them.

### defaults\pref\000-cyrune-autoload.js

Save as UTF-8 without BOM, with LF line endings. The `000-` prefix is intentional:
it gave this selector precedence over the existing Bitdefender preference file
in the tested Firefox installation.

```javascript
// Cyrune Relay: privileged AutoConfig; browser content sandbox is unchanged.
pref("general.config.sandbox_enabled", false);
pref("general.config.filename", "cyrune-relay.cfg");
pref("general.config.obscure_value", 0);
```

### cyrune-relay.cfg

The first line must remain a comment because Firefox skips it. The following
contents reproduce the installed configuration, with whitespace normalized.
The Bitdefender setting is specific to this machine's existing configuration;
review it when adapting the setup to another machine.

```javascript
//Set by BitDefender.
lockPref("security.enterprise_roots.enabled", true);

// BEGIN CYRUNE RELAY AUTOLOAD
// Cyrune Relay startup loader, adapted from tsaost/autoload-temporary-addon.
pref("cyrune.relay.autoload.evaluated", true);
(() => {
  const { interfaces: Ci, utils: Cu } = Components;
  if (Services.appinfo.inSafeMode) return;
  const observer = {
    observe() {
      Services.obs.removeObserver(observer, "final-ui-startup");
      const profile = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
      const defaultEnabled = profile.toLowerCase() === "c:\\users\\chris\\appdata\\roaming\\mozilla\\firefox\\profiles\\qwee2l58.default-release";
      if (!Services.prefs.getBoolPref("cyrune.relay.autoload.enabled", defaultEnabled)) return;
      (async () => {
        const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        const { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");
        const existing = await AddonManager.getAddonByID("morpheus-webhub@local");
        if (existing && !existing.temporarilyInstalled) return;
        const addon = await AddonManager.installTemporaryAddon(new FileUtils.File("F:\\Projects\\Coding\\Cyrune\\Relay"));
        Services.prefs.setStringPref("cyrune.relay.autoload.status", "Loaded " + addon.version);
      })().catch(error => {
        Services.prefs.setStringPref("cyrune.relay.autoload.status", "Failed: " + error.message);
        Cu.reportError("Cyrune Relay autoload: " + error);
      });
    }
  };
  Services.obs.addObserver(observer, "final-ui-startup");
})();
// END CYRUNE RELAY AUTOLOAD
```

## Restore after an update or reinstall

Normal in-place updates are expected to retain these custom files, but this is
not a guarantee. A clean reinstall, managed configuration change, or change to
Firefox's internal APIs can require repair.

1. Fully exit Firefox, including any remaining background processes. Preserve the
   existing Firefox profile and Cyrune data; do not reset or delete them.
2. Confirm Firefox's installation directory and the active profile's **Root
   Directory** from `about:profiles` (record it before closing, if needed).
   Confirm the Relay directory still contains `manifest.json`.
3. Back up any existing versions of the two custom files to a dated directory
   outside the checkout. Inspect other files in `defaults\pref` for
   `general.config.filename` and review their referenced configs. Preserve any
   newly introduced managed settings.
4. With an elevated editor, recreate `cyrune-relay.cfg` from the snippet above,
   then recreate `defaults\pref\000-cyrune-autoload.js`. Save both as UTF-8
   without BOM, preferably LF, without an extra `.txt` suffix. Install the `.cfg`
   first so the preference file never selects a missing config.
5. If the checkout moved, update the `FileUtils.File` path. If the active profile
   changed, update the lowercase comparison path. JavaScript string literals
   require doubled backslashes as shown. Alternatively, explicitly create the
   boolean `cyrune.relay.autoload.enabled = true` in the intended profile's
   `about:config` to opt that profile in; restart afterward.
6. Start Firefox normally and verify the result below. If the files are present
   but loading still fails, diagnose the API or configuration problem before
   repeatedly reinstalling the same files.

## Verify and diagnose

In `about:debugging#/runtime/this-firefox`, confirm **Cyrune Relay** appears under
temporary extensions with the expected version and ID. Open its toolbar popup to
check that the extension runs. This is stronger evidence than an old status
preference. Fully exit and restart again to confirm automatic loading.

Inspect these preferences in `about:config`:

| Preference | Expected meaning |
| --- | --- |
| `general.config.filename` | `cyrune-relay.cfg`; another value indicates a competing selector. |
| `general.config.obscure_value` | `0`. |
| `general.config.sandbox_enabled` | `false`, required for the privileged loader. |
| `cyrune.relay.autoload.enabled` | Normally absent: only the recorded profile defaults to enabled. Explicit `false` disables loading; explicit `true` opts a profile in. |
| `cyrune.relay.autoload.evaluated` | `true` means the config has executed at least once. |
| `cyrune.relay.autoload.status` | `Loaded <version>` after installation, or `Failed: <message>` after a caught install error. |
| `security.enterprise_roots.enabled` | `true` and locked, preserving the existing Bitdefender requirement. |

The `evaluated` and `status` preferences persist across sessions and may be stale.
Reset those two diagnostic preferences before a clean restart if fresh evidence
is needed. The status is not updated when loading is disabled, Firefox is in
Troubleshoot Mode, or a permanent Relay installation takes precedence.

- **Missing custom files:** restore them from the snippets above.
- **Wrong profile or moved checkout:** correct the paths or opt the profile in.
  Make sure an explicit `enabled = false` is not overriding the default.
- **Config read error or startup dialog:** check the config filename, initial
  comment, syntax, encoding and line endings. Use rollback below if startup is
  blocked.
- **Config selected but no temporary Relay:** check for a permanent installation,
  Troubleshoot Mode, and errors in **Browser Console** (`Ctrl+Shift+J`), especially
  `Cyrune Relay autoload`, the config filename, missing modules and initialization
  failures. Errors before the install promise may appear only in that console.
- **Internal API changed:** verify current Mozilla source for
  `AddonManager.sys.mjs`, `FileUtils.sys.mjs`, `installTemporaryAddon`, and the
  startup timing. Update the loader to the supported current imports/API; the
  upstream repository's old `.jsm` imports are not the tested implementation.
  Validate changes with a disposable Firefox profile and isolated Host/Nexus/Arcade
  data as in the repository's Firefox validators, then confirm normal-profile
  startup. Do not automate a reset of the real profile to test a repair.

For immediate manual recovery, use **Load Temporary Add-on** in
`about:debugging#/runtime/this-firefox` and select `Relay\manifest.json`. That
restores the current session only; it does not repair startup autoload.

## Disable or remove

To pause loading for a profile, set `cyrune.relay.autoload.enabled` to `false` and
fully restart Firefox. This leaves privileged AutoConfig enabled.

To remove this setup completely, fully exit Firefox and, with administrator
access, remove or move `defaults\pref\000-cyrune-autoload.js` out of that directory
first, then remove or move `cyrune-relay.cfg`. Do not alter Bitdefender's original
files. Removing the custom selector restores their original AutoConfig selection
and the default AutoConfig sandbox setting, unless another configuration overrides
them. Verify after restart. The loader's four `cyrune.relay.autoload.*` preferences
may then be reset; preserve extension storage and the profile.

## References

- [Mozilla AutoConfig setup and file rules](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig).
- [Original autoload-temporary-addon method](https://github.com/tsaost/autoload-temporary-addon).
- [Current Mozilla AddonManager source](https://searchfox.org/firefox-main/source/toolkit/mozapps/extensions/AddonManager.sys.mjs).
