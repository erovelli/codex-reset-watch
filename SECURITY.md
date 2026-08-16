# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| Earlier versions | No |

Only the latest published 1.x version receives security fixes. Upgrade before reporting an issue that is already fixed in a newer release.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository. Do not include credentials, Web Push subscription data, VAPID private keys, pairing codes, or exploit details in a public issue.

Include the affected version, operating system, reproduction steps, impact, and any suggested remediation. You should receive an initial acknowledgement within seven days. There is no bug-bounty program or guaranteed remediation timeline.

Operational failures and non-sensitive bugs can be reported through ordinary GitHub issues.

## Sensitive local data

The configuration file contains a Web Push endpoint, subscription encryption keys, and a VAPID private key. Treat the file and pairing codes as private. Codex Reset Watch never needs an OpenAI API key and reports only ChatGPT-managed rate-limit data obtained from the local Codex App Server process.
