export class ServiceError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.body = body;
  }
}

