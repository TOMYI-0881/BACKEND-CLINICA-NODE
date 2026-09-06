export interface GithubWebhookEvent {
  eventType: string;
  action?: string;
  repository?: string;
  sender?: string;
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function nestedStringField(obj: Record<string, unknown>, key: string, nestedKey: string): string | undefined {
  const nested = obj[key];
  if (typeof nested !== 'object' || nested === null) return undefined;
  return stringField(nested as Record<string, unknown>, nestedKey);
}

export function parseGithubEvent(rawBody: Buffer, eventHeader: string | undefined): GithubWebhookEvent {
  const json = JSON.parse(rawBody.toString('utf-8')) as Record<string, unknown>;

  return {
    eventType: eventHeader ?? 'unknown',
    action: stringField(json, 'action'),
    repository: nestedStringField(json, 'repository', 'full_name'),
    sender: nestedStringField(json, 'sender', 'login'),
  };
}

export function formatGithubEventMessage(event: GithubWebhookEvent): string {
  const parts = [`GitHub: ${event.eventType}`];
  if (event.action) parts.push(event.action);
  if (event.repository) parts.push(`en ${event.repository}`);
  if (event.sender) parts.push(`por ${event.sender}`);
  return parts.join(' ');
}
