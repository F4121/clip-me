import type { JobType } from "@prisma/client";

export interface EnqueueParams {
  type: JobType;
  sourceVideoId?: string;
  exportedClipId?: string;
}

export type QueueItem = EnqueueParams & { jobId: string };
