# Contributing to Worldkeeper

Thanks for considering a contribution. Worldkeeper is licensed under the BSD 2-Clause License; see [LICENSE](LICENSE).

## Before opening a change

- Check existing issues and [Development Status](DEVELOPMENT_STATUS.md) for known work.
- For significant changes, open an issue first to discuss scope and compatibility with existing worlds.
- Preserve stable record IDs, source references, canon labels, protected originals and campaign overlays.
- Treat player-data disclosure as a security-sensitive change; do not add a player-facing endpoint that bypasses the player projection.
- Avoid adding mandatory cloud services, paid APIs or AI providers to core features.

## Development checks

```bash
npm ci
npm run typecheck
npm test
npm run build
```

When UI behavior changes, run the relevant browser smoke test from [Development](docs/DEVELOPMENT.md). Include tests for bug fixes and changes to import, canon, publication or backup behavior.

## Pull request guidance

Describe the problem, approach, compatibility impact, tests performed and any migration implications. Add screenshots for visible UI changes. Do not include real campaign secrets, copyrighted purchased rulebook content, access tokens, personal data or generated database files.

## Security findings

Do not publish a proof of concept for a security vulnerability in a public issue before coordinated disclosure. Follow [SECURITY.md](SECURITY.md).
