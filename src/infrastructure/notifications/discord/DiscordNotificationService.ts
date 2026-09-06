import { NotificationService } from '../../../domain/ports/NotificationService';

const DEFAULT_TIMEOUT_MS = 5_000;

export class DiscordNotificationService implements NotificationService {
  constructor(
    private readonly webhookUrl: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async notify(message: string): Promise<void> {
    if (!this.webhookUrl) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Discord respondio con status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
