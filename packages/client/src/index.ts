export { ServiceError } from "./service-error";
export { createSchemaClient, type ServiceFetcher } from "./schema-client";
export type { Result } from "./result";
export { andThenResult, err, mapError, mapResult, ok, withCode } from "./result";
export { createFeedbackGitopsClient, type FeedbackGitopsClient, type FeedbackGitopsClientConfig } from "./feedback-gitops";
