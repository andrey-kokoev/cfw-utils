import { GitHubIssuePayloadSchema, type FeedbackSubmission, type GitHubIssuePayload } from "@cfw-utils/schemas";

export interface ConsumerConfig {
  github: {
    pat: string;
    owner: string;
    repo: string;
    labels: string[];
  };
}

const MAX_RETRIES = 3;

/**
 * Creates a Queue consumer that processes feedback submissions and creates GitHub issues.
 */
export function createIssueConsumer<T>(config: ConsumerConfig) {
  return async (batch: MessageBatch<T>, env: unknown): Promise<void> => {
    const failures: string[] = [];

    for (const message of batch.messages) {
      try {
        await processMessage(message.body as FeedbackSubmission, config);
      } catch (error) {
        console.error(`Failed to process message ${message.id}:`, error);
        failures.push(message.id);
      }
    }

    if (failures.length > 0) {
      // In a real implementation, we might want to use individual ack/retry
      // For now, we retry all if any failed (simpler approach)
      console.warn(`${failures.length} messages failed, retrying batch`);
      batch.retryAll();
    } else {
      batch.ackAll();
    }
  };
}

async function processMessage(payload: FeedbackSubmission, config: ConsumerConfig): Promise<void> {
  const issuePayload = buildIssuePayload(payload, config.github.labels);

  // Validate payload
  const validated = GitHubIssuePayloadSchema.safeParse(issuePayload);
  if (!validated.success) {
    throw new Error(`Invalid issue payload: ${validated.error.message}`);
  }

  await createGitHubIssue(validated.data, config.github);
}

function buildIssuePayload(submission: FeedbackSubmission, defaultLabels: string[]): GitHubIssuePayload {
  const labels = [...new Set([...defaultLabels, ...(submission.labels || [])])];

  const contextLines: string[] = [];
  if (submission.url) {
    contextLines.push(`- URL: ${submission.url}`);
  }
  if (submission.userAgent) {
    contextLines.push(`- User-Agent: ${submission.userAgent}`);
  }
  contextLines.push(`- Timestamp: ${new Date().toISOString()}`);

  const body = [submission.description, "", "**Context:**", ...contextLines.map((line) => `- ${line}`)].join("\n");

  return {
    title: submission.title,
    body,
    labels,
  };
}

async function createGitHubIssue(
  payload: GitHubIssuePayload,
  github: { pat: string; owner: string; repo: string },
): Promise<void> {
  const url = `https://api.github.com/repos/${github.owner}/${github.repo}/issues`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${github.pat}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cfw-feedback-gitops",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: payload.title,
      body: payload.body,
      labels: payload.labels,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }
}
