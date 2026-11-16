# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately**, not through public GitHub issues or discussions. If the repository enables [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository), use its **Security → Report a vulnerability** action.

If private vulnerability reporting is not enabled, **maintainers should configure a private contact channel before claiming one is available**. Do not include unpublished exploits, access tokens or GM secrets in public reports.

Useful reports include: affected version/commit, reproduction steps, expected versus observed behavior, impact and a minimal synthetic test fixture.

## Sensitive surfaces

- DM API and its network binding.
- Player projection, reveals, map labels, links, recaps and published assets.
- Markdown/ZIP import, uploads and archive restoration.
- GitHub publication tokens and static handbook history.
- SQLite database and off-device backup confidentiality.

## Operational precautions

The DM server is intended for loopback access by default. Do not bind it directly to an untrusted network. The separate player-only process is designed for trusted LAN use and should not be directly internet-exposed without reviewed access controls. Review static handbooks before publication; public Git history may retain past disclosures.

## Supported versions

The repository's current actively maintained release line is the intended target for security fixes. Refer to [Development Status](DEVELOPMENT_STATUS.md) and [Releases](https://github.com/n1x-shell/Worldkeeper/releases) for the latest supported builds. This document does not claim a formal long-term support policy.
