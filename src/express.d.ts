import type { Role } from "config/constants";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; name: string; email: string; role: Role };
      requestId?: string;
    }
  }
}

export {};
