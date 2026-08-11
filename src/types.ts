export interface RateLimitWindow {
  key: string;
  limitId: string;
  limitName?: string;
  windowKind: "primary" | "secondary" | string;
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number;
}

export interface UsageSnapshot {
  observedAt: number;
  accountType: string;
  windows: RateLimitWindow[];
}

export interface UsageSource {
  read(): Promise<UsageSnapshot>;
  readAccount(): Promise<AccountStatus>;
}

export interface AccountStatus {
  authenticated: boolean;
  accountType?: string;
  planType?: string;
  reason?: string;
}

export type NotificationStatus =
  | "sent"
  | "not-requested"
  | "sending"
  | "failed"
  | "quota-exhausted";

export interface ResetEventRecord {
  id: string;
  kind: "scheduled" | "unexpected";
  detectedAt: number;
  expectedResetAt: number;
  observedResetAt: number;
  peakUsedPercent: number;
  notificationStatus: NotificationStatus;
  notificationError?: string;
  providerMessageId?: string;
}

export interface WindowState {
  expectedResetAt: number;
  previousObservedResetAt: number;
  lastObservedAt: number;
  lastUsedPercent: number;
  peakUsedPercent: number;
  currentWindowStartedAt?: number;
  lastResetEvent?: ResetEventRecord;
}

export interface ResetEvent extends ResetEventRecord {
  windowKey: string;
  limitId: string;
  limitName?: string;
  windowKind: string;
  windowDurationMins: number;
  earlyBySeconds?: number;
}

export interface WebPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushConfig {
  setupUrl: string;
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  subscription: WebPushSubscription;
}

export interface Recipient {
  phone?: string;
  webPushSubscription?: WebPushSubscription;
}

export interface Notification {
  id: string;
  message: string;
}

export type RetryDisposition = "transient" | "permanent";

export interface NotificationResult {
  status: "sent" | "failed" | "quota-exhausted";
  providerMessageId?: string;
  error?: string;
  retryable?: boolean;
}

export interface NotificationProvider {
  readonly id: string;
  send(notification: Notification, recipients: Recipient[]): Promise<NotificationResult>;
  classifyFailure(error: unknown): RetryDisposition;
}

export interface MonitorConfig {
  schemaVersion: 1;
  phone: string;
  pollingIntervalMins: number;
  gracePeriodMins: number;
  notifyUnexpected: boolean;
  notifyScheduled: boolean;
  provider: "textbelt-free" | "web-push";
  monitoredWindowKeys: string[];
  codexPath: string;
  nodePath: string;
  installedVersion: string;
  acceptedSmsTermsAt: number;
  schedulerId: string;
  webPush?: WebPushConfig;
}

export interface MonitorState {
  schemaVersion: 1;
  windows: Record<string, WindowState>;
  lastSuccessfulCheck?: number;
  lastCheckAttempt?: number;
  lastCheckError?: string;
  lastSnapshot?: UsageSnapshot;
}

export interface SchedulerConfig {
  pollingIntervalMins: number;
  nodePath: string;
  runtimePath: string;
  logPath: string;
}

export interface SchedulerStatus {
  installed: boolean;
  running: boolean;
  adapter: string;
  detail?: string;
}

export interface Scheduler {
  readonly id: string;
  install(config: SchedulerConfig): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<SchedulerStatus>;
}
