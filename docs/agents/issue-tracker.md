# Issue tracker: GitHub

Issues and specs live in MCP-00101010/Cyrune on GitHub.
Use the gh CLI with --repo MCP-00101010/Cyrune.

On this Windows environment, if gh reports no login after successful browser
authorization, set `$env:GH_CONFIG_DIR = Join-Path $env:USERPROFILE '.config/gh'`
in PowerShell and retry `gh auth status` before requesting another login.
Use that configuration directory for subsequent gh commands in the session.

- Publish a ticket: gh issue create.
- Fetch a ticket: gh issue view <number> --json number,title,body,labels,comments.
- Find tickets: gh issue list with appropriate state and label filters.
- Update tickets: gh issue edit, comment, or close.
- For multiline content, write the exact text to a temporary file and use --body-file.

Link child tickets using GitHub sub-issues and blockers using native issue
dependencies. If unavailable, use a parent task list, a "Part of #<parent>"
line in each child, and explicit "Blocked by: #<number>" references.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding

Use one issue labelled wayfinder:map as the map, with linked child issues
labelled wayfinder:research, wayfinder:prototype, wayfinder:grilling,
or wayfinder:task. Choose the first unassigned child in map order with
no open blockers. Claim it by assigning yourself. Record findings before
closing it, then add a findings summary and link to the map.
