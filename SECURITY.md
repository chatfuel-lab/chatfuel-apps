# Security

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting on this repository:
Security tab → "Report a vulnerability". Never open a public issue for a vulnerability.

Do not include a real Chatfuel token or any key in a report. Anything shaped like a
credential will be treated as compromised — rotate it first.

## Scope

This repository is data the wizard executes: overlays become source code in users' projects,
playbooks become instructions their coding agents follow, and `npmDependencies` get installed
on their machines. The validator (`scripts/validate.mjs`) and the wizard's scaffold-time
checks are the boundary.

In scope:

- an overlay that escapes the deny list, replaces a wizard-owned file, or resolves outside
  the scaffold directory despite the validator passing
- a manifest that smuggles a secret declaration or a wizard-step hook past the schema
- malicious content in a published app — overlay code, a playbook instruction, or a
  dependency that does something a user did not sign up for

Out of scope:

- the wizard runtime itself — report to
  [chatfuel-wizard](https://github.com/chatfuel-lab/chatfuel-wizard/security), which has its
  own scope
- Chatfuel's hosted API and product
- a user's own modifications to their scaffolded app
