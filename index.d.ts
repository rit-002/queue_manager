declare module "event-queue-manager" {
  export interface QueueOptions {
    eventId: string;
    organization: string;
    limit: number;
    description?: string;
  }

  export class QueueManager {
    constructor(options: QueueOptions);
    joinQueue(userId: string): { success: boolean; message: string };
    leaveQueue(userId: string): void;
    getQueue(): string[];
  }
}
