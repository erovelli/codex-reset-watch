# codex-reset-watch

```bash
npx codex-reset-watch install
```

`codex-reset-watch` is a small TypeScript CLI that checks the rate-limit windows reported by your local Codex CLI and notifies you when a weekly quota resets unexpectedly early. It uses a native per-user scheduler, so no Node daemon stays running.

Alerts can use zero-cost iOS Web Push or Textbelt Free SMS. This is an independent open-source utility, not an official OpenAI, Apple, or Textbelt product.

## Requirements

- macOS or Linux
- Node.js 22 or newer (Node 22 and 24 LTS are supported)
- the [Codex CLI](https://learn.chatgpt.com/docs/codex-cli) authenticated through ChatGPT (`codex login`)

iOS Web Push additionally requires iOS/iPadOS 16.4 or newer and adding the HTTPS setup app to the Home Screen. It does not require an Apple Developer membership.

API-key billing limits are intentionally not supported. The monitor reads ChatGPT-managed Codex limits from the local [`codex app-server`](https://learn.chatgpt.com/docs/app-server) stdio protocol. It never starts a model turn.

## What installation does

The installer explains the SMS policy, asks for a permitted phone number, verifies Codex, records the first observation as a no-alert baseline, copies the bundled CLI to a stable per-user path, and enables a native scheduler immediately.

Recommended defaults are:

- every reported weekly window is monitored
- one check every 30 minutes
- unexpected-reset SMS on
- scheduled-reset SMS off
- 60-minute scheduled-reset grace period
- one recipient through Textbelt Free

An `npx` install never leaves launchd, systemd, or cron pointing into npm's temporary cache. It captures the absolute Node and Codex paths and installs a stable bundled runtime under the normal per-user data directory.

## Use iOS Web Push instead of SMS

Textbelt Free is unavailable for some destinations. To switch an existing installation to native iOS Web Push:

```bash
npm run build                 # only when running from this source checkout
node dist/cli.js setup-web-push
```

For an npm/Homebrew installation, use `codex-reset-watch setup-web-push` instead. The command prints a personalized HTTPS setup link and guides you through these steps:

1. Open the link in Safari on the iPhone.
2. Use Share → **Add to Home Screen**.
3. Open the installed Home Screen app and tap **Enable notifications**.
4. Copy its one-time pairing code back into the terminal.
5. Accept the offered test push.

The command then switches the scheduled monitor to Web Push, updates its stable bundled runtime, and restarts the scheduler. Scheduled-reset alerts are turned off; your existing unexpected-reset setting is retained. Test again at any time without a message fee:

```bash
codex-reset-watch test-push
```

The static setup app never receives or stores the subscription on a server. It creates the browser subscription locally and gives it to you as a pairing code. The VAPID private key and device subscription stay in the local mode-0600 configuration file. Sending an alert makes one encrypted HTTPS Web Push request to the device's push service; no Codex credentials are included.

The default setup URL is `https://erovelli.github.io/codex-reset-watch/`. The source is in [`web/`](web), and [the Pages workflow](.github/workflows/pages.yml) publishes that exact static directory. A fork or private deployment can pass its own HTTPS URL with `setup-web-push --url https://example.com/path/`.

## SMS policy and consent

The default provider is Textbelt's hosted HTTPS endpoint with the public `textbelt` key. [Textbelt documents one free SMS per day](https://docs.textbelt.com/guides/sending-sms-from-command-line); no paid key or credits are required. This third-party policy can change, and delivery is best effort. Do not use the tool for emergencies.

Scheduled texts are disabled because they can consume the day's free message and prevent a later unexpected-reset alert. Alerts include `Reply STOP to unsubscribe.` [Textbelt handles STOP automatically](https://docs.textbelt.com/compliance); the recipient can opt back in only by replying START. Configure only a number you own/control or have explicit permission to notify.

The installer never sends a test message. To do so explicitly:

```bash
codex-reset-watch test-sms
```

This warns and asks for confirmation because it consumes the free daily message. Provider request validation without delivery or quota use is also available:

```bash
codex-reset-watch test-sms --validate
```

The foreground test prints every provider attempt and retry delay. Keep it open until a final result appears: retries run inside that process and are not handed to a separate queue. Once Textbelt reports that it accepted the request, the command says it is safe to close; carrier delivery is still best effort.

## Commands

```text
codex-reset-watch install
codex-reset-watch configure
codex-reset-watch status
codex-reset-watch check
codex-reset-watch setup-web-push
codex-reset-watch test-push
codex-reset-watch test-sms
codex-reset-watch start
codex-reset-watch stop
codex-reset-watch restart
codex-reset-watch uninstall
```

`configure` shows all currently discovered windows and preserves existing values as defaults. When Web Push is active it retains the paired device; run `setup-web-push` to replace it. Intervals from 5 minutes through 24 hours are accepted; intervals above two hours carry a reliability warning. `status` shows the scheduler, provider/pairing state, account state, every discovered bucket, monitored usage and peak, reset times in the local timezone, and the latest reset/notification outcome.

On macOS the scheduler is a per-user LaunchAgent. On Linux it prefers a user-level systemd one-shot service and timer, falling back to a managed user crontab block. Root is not required.

## How detection works

Detection is a pure state machine evaluated against the previous persisted observation before adopting any new advertised reset timestamp. It combines utilization drops, near-zero usage, an advanced next-reset timestamp, the inferred start of the new window, and observation recency.

An early event is called unexpected only when there is strong reset evidence and a sufficiently recent pre-reset sample. If the computer was offline across the advertised reset, the event is treated as scheduled/ambiguous rather than producing an early-reset false positive. A timestamp change without reset evidence updates the expected schedule but never sends an alert.

`peak observed use` is the highest value seen by polling during the closed window; it is not claimed to be an exact maximum. A stable logical event ID plus state persisted before a notification attempt prevents repeat sends after overlapping checks or restarts. Daily SMS quota exhaustion is recorded and never retried. Temporary provider failures use bounded exponential backoff with jitter.

## Privacy and files

Codex credentials remain owned by Codex and are never read or transmitted by this program. App Server uses local stdio, not a network listener. Configuration—including a phone number or Web Push subscription and VAPID private key—stays in a mode-0600 local JSON file. Usage information leaves the computer only when an enabled alert is sent. Textbelt receives SMS recipient/content under its own [privacy policy](https://textbelt.com/privacy/); Web Push sends an encrypted payload through the subscribed browser push service.

Locations follow platform conventions:

- Linux: `$XDG_CONFIG_HOME`, `$XDG_STATE_HOME`, and `$XDG_DATA_HOME` (with standard `~/.config` / `~/.local` fallbacks)
- macOS: `~/Library/Application Support/codex-reset-watch` and `~/Library/Logs/codex-reset-watch`

JSON config and state are atomically replaced after file and directory synchronization. Logs are small, phone-masked, and rotated at roughly 1 MB.

## Troubleshooting

- **Codex missing:** install with `npm install -g @openai/codex`, then run `codex login`.
- **Wrong account type:** sign into Codex with ChatGPT; ordinary OpenAI API-key limits are not this tool's target.
- **Check failures:** run `codex-reset-watch check`, then inspect `codex-reset-watch status` and the monitor log.
- **No unexpected classification after downtime:** this is deliberate; a recent sample is required to minimize false positives.
- **Quota exhausted:** wait for Textbelt's free allowance to become available. The same event will not be retried.
- **Textbelt disabled for your destination:** use `codex-reset-watch setup-web-push` instead; repeated Textbelt attempts will not help.
- **Web Push setup says to use the Home Screen:** iOS grants Web Push only to a Home Screen web app. Add it from Safari, then open the icon.
- **Web Push permission denied:** enable notifications for Reset Watch in iOS Settings, or remove/re-add the Home Screen app and pair again.
- **Push subscription expired:** run `codex-reset-watch setup-web-push` again. A 404/410 response is treated as permanent and is not retried every poll.
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

The core boundaries are:

- `UsageSource` and `src/codex/`: one-shot App Server integration and defensive normalization
- `src/detection/`: filesystem-free reset state machine
- `src/notifications/`: provider interface, message construction, and bounded retry policy
- `src/state/`: private atomic JSON persistence
- `src/scheduler/`: launchd, systemd-user, and cron adapters
- `src/runtime/`: locked one-shot monitoring and stable runtime installation

Adding a provider should implement `NotificationProvider`; it does not require detector changes. V1 exposes one recipient/device per provider, while the interface already accepts a recipient list. `src/notifications/providers/web-push.ts` owns VAPID delivery and `web/` is a serverless subscription UI.

Tests use mock App Server, Textbelt, and Web Push implementations. CI never sends a real SMS or push notification.

## Homebrew readiness

Npm/npx is the first distribution target. [`packaging/homebrew`](packaging/homebrew) contains a formula template and release checklist. It intentionally has placeholders until an actual npm or GitHub release exists—there are no invented URLs or checksums.

## License

MIT
