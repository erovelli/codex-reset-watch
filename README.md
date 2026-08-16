# codex-reset-watch

```bash
npx codex-reset-watch install
```

`codex-reset-watch` is a small TypeScript CLI that checks the rate-limit windows reported by your local Codex CLI and sends a Web Push notification when a weekly quota resets unexpectedly early. It uses a native per-user scheduler, so no Node daemon stays running.

This is an independent open-source utility, not an official OpenAI or Apple product. Notifications are best effort; do not use it for emergencies.

## Version 1.0

Version 1.0 is the first stable release and establishes the supported CLI and configuration baseline:

- macOS and Linux with Node.js 22 or 24
- ChatGPT-authenticated Codex CLI rate limits read through the local App Server protocol
- per-user launchd, systemd, or cron scheduling without a resident Node daemon
- one paired iPhone or iPad Home Screen app using standards-based Web Push

Existing Web Push configurations remain compatible. Installations that still contain legacy SMS settings must run `setup-web-push`; saving the new pairing removes the obsolete phone-number and consent fields. Notification permission is requested only after the user opens the installed Home Screen app and taps **Enable notifications**.

## Requirements

- macOS or Linux
- Node.js 22 or newer (Node 22 and 24 LTS are supported)
- the [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) authenticated through ChatGPT (`codex login`)
- iOS/iPadOS 16.4 or newer with the HTTPS setup app added to the Home Screen

API-key billing limits are intentionally not supported. The monitor reads ChatGPT-managed Codex limits from the local [`codex app-server`](https://learn.chatgpt.com/docs/app-server) stdio protocol. It never starts a model turn.

## Installation

The installer verifies Codex, lets you select monitoring settings, guides you through Web Push pairing, records the first observation as a no-alert baseline, copies the bundled CLI to a stable per-user path, and enables a native scheduler immediately.

Recommended defaults are:

- every reported weekly window is monitored
- one check every 30 minutes
- unexpected-reset notifications on
- scheduled-reset notifications off
- 60-minute scheduled-reset grace period
- one paired Web Push device

An `npx` install never leaves launchd, systemd, or cron pointing into npm's temporary cache. It captures the absolute Node and Codex paths and installs a stable bundled runtime under the normal per-user data directory.

During pairing, the command prints a personalized HTTPS setup link and guides you through these steps:

1. Open the link in Safari on the iPhone.
2. Use Share → **Add to Home Screen**.
3. Open the installed Home Screen app and tap **Enable notifications**.
4. Copy its pairing code back into the terminal.
5. Accept the offered test push.

Web Push has no per-message fee and does not require an Apple Developer membership. The static setup app never receives or stores the subscription on a server. It creates the browser subscription locally and gives it to you as a pairing code.

The VAPID private key and device subscription stay in the local mode-0600 configuration file. Sending an alert makes one encrypted HTTPS Web Push request to the device's push service; no Codex credentials are included.

The default setup URL is `https://erovel.li/codex-reset-watch/`, the repository's canonical GitHub Pages domain. The source is in [`web/`](web), and [the Pages workflow](.github/workflows/pages.yml) publishes that exact static directory. A fork or private deployment can pass its own HTTPS URL with:

```bash
codex-reset-watch setup-web-push --url https://example.com/path/
```

Run `setup-web-push` at any time to replace an expired subscription or pair a different device. Treat a pairing code as private until it has been pasted into the CLI. Installations created by versions that supported SMS can use the same command to migrate; saving the migrated configuration removes the legacy phone number and SMS-consent fields.

## Commands

```text
codex-reset-watch install
codex-reset-watch configure
codex-reset-watch status
codex-reset-watch check
codex-reset-watch setup-web-push
codex-reset-watch test-push
codex-reset-watch start
codex-reset-watch stop
codex-reset-watch restart
codex-reset-watch uninstall
```

`configure` shows all currently discovered windows and preserves existing values as defaults. It retains the paired device; run `setup-web-push` to replace it. Intervals from 5 minutes through 24 hours are accepted; intervals above two hours carry a reliability warning. `status` shows the scheduler, provider/pairing state, account state, every discovered bucket, monitored usage and peak, reset times in the local timezone, and the latest reset/notification outcome.

On macOS the scheduler is a per-user LaunchAgent. On Linux it prefers a user-level systemd one-shot service and timer, falling back to a managed user crontab block. Root is not required.

## How detection works

Detection is a pure state machine evaluated against the previous persisted observation before adopting any new advertised reset timestamp. It combines utilization drops, near-zero usage, an advanced next-reset timestamp, the inferred start of the new window, and observation recency.

An early event is called unexpected only when there is strong reset evidence and a sufficiently recent pre-reset sample. If the computer was offline across the advertised reset, the event is treated as scheduled/ambiguous rather than producing an early-reset false positive. A timestamp change without reset evidence updates the expected schedule but never sends an alert.

`peak observed use` is the highest value seen by polling during the closed window; it is not claimed to be an exact maximum. A stable logical event ID plus state persisted before a notification attempt prevents repeat sends after overlapping checks or restarts. Temporary delivery failures use bounded exponential backoff with jitter; permanent subscription failures are recorded without repeated sends.

## Privacy and files

Codex credentials remain owned by Codex and are never read or transmitted by this program. App Server uses local stdio, not a network listener. Configuration—including the Web Push subscription and VAPID private key—stays in a mode-0600 local JSON file. Usage information leaves the computer only in the encrypted payload of an enabled notification.

Locations follow platform conventions:

- Linux: `$XDG_CONFIG_HOME`, `$XDG_STATE_HOME`, and `$XDG_DATA_HOME` (with standard `~/.config` / `~/.local` fallbacks)
- macOS: `~/Library/Application Support/codex-reset-watch` and `~/Library/Logs/codex-reset-watch`

JSON config and state are atomically replaced after file and directory synchronization. Logs are private and rotated at roughly 1 MB.

## Troubleshooting

- **Codex missing:** follow the current [Codex CLI installation instructions](https://learn.chatgpt.com/docs/codex/cli), then run `codex login`.
- **Wrong account type:** sign into Codex with ChatGPT; ordinary OpenAI API-key limits are not this tool's target.
- **Check failures:** run `codex-reset-watch check`, then inspect `codex-reset-watch status` and the monitor log.
- **No unexpected classification after downtime:** this is deliberate; a recent sample is required to minimize false positives.
- **Web Push setup says to use the Home Screen:** iOS grants Web Push only to a Home Screen web app. Add it from Safari, then open the icon.
- **Web Push permission denied:** enable notifications for Reset Watch in iOS Settings, or remove/re-add the Home Screen app and pair again.
- **Push subscription expired:** run `codex-reset-watch setup-web-push` again. A 404/410 response is permanent and is not retried every poll.
- **Legacy SMS configuration:** run `codex-reset-watch setup-web-push` to migrate it before using other commands.
- **Scheduler stopped:** run `codex-reset-watch restart`; `configure` also reinstalls/restarts it.

`uninstall` removes the scheduler entry and stable runtime, asks whether to retain config/state, and never changes Codex authentication.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run build:web
```

Release steps, required npm settings, and artifact verification are documented in [`RELEASING.md`](RELEASING.md). Security issues should follow [`SECURITY.md`](SECURITY.md), not a public issue.

The core boundaries are:

- `UsageSource` and `src/codex/`: one-shot App Server integration and defensive normalization
- `src/detection/`: filesystem-free reset state machine
- `src/notifications/`: delivery-provider interface, message construction, and bounded retry policy
- `src/state/`: private atomic JSON persistence
- `src/scheduler/`: launchd, systemd-user, and cron adapters
- `src/runtime/`: locked one-shot monitoring and stable runtime installation

Adding a future delivery format means adding a discriminated recipient type and implementing `NotificationProvider`; it does not require detector changes. V1 delivery supports one Web Push device, while the interface already accepts a recipient list.

Tests use mock App Server and Web Push implementations. CI never sends a real push notification.

## Homebrew readiness

Npm/npx is the first distribution target. [`packaging/homebrew`](packaging/homebrew) contains a formula template and release checklist. It intentionally has placeholders until an actual npm or GitHub release exists—there are no invented URLs or checksums.

## License

MIT
