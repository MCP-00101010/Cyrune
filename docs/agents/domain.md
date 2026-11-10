# Domain docs

## Reading rules

Before exploring a domain, read root GLOSSARY.md if present and relevant
decisions in docs/adr/. Follow the repository's component instruction
routing before exploring component files.

If glossary or ADR files are absent, proceed silently. Create them lazily
when domain-modeling work resolves terminology or decisions.

## Layout and ownership

Use one root GLOSSARY.md and docs/adr/ for decision records.
Keep durable cross-component and interface rules in docs/architecture/,
as required by AGENTS.md. ADRs record decision rationale and link to
the authoritative architecture rules.

## Vocabulary and conflicts

Use glossary terms consistently in tickets, proposals, hypotheses,
and tests. Note meaningful terminology gaps for domain-modeling work.

Surface conflicts with existing ADRs explicitly, identifying the decision
and why it may need reconsideration.
