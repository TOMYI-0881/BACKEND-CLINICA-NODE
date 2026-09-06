import { RequestHandler } from 'express';
import { NotificationService } from '../../../domain/ports/NotificationService';
import { parseGithubEvent, formatGithubEventMessage } from '../../../infrastructure/webhooks/github/GithubEventParser';
import { logError } from '../../../application/logError';

export interface WebhooksControllerDeps {
  notifier: NotificationService;
}

export interface WebhooksController {
  github: RequestHandler;
}

export function createWebhooksController(deps: WebhooksControllerDeps): WebhooksController {
  const github: RequestHandler = (req, res) => {
    const event = parseGithubEvent(req.body as Buffer, req.header('x-github-event'));
    const message = formatGithubEventMessage(event);
    deps.notifier.notify(message).catch(logError);
    res.status(200).json({ ok: true });
  };

  return { github };
}
