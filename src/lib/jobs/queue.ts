import { db } from "@/lib/db";
import { JobStatus, JobType } from "@prisma/client";
import type { EnqueueParams, QueueItem } from "./types";
import { runDownloadVideo } from "./runners/downloadVideo";
import { runTranscribe } from "./runners/transcribe";
import { runSuggestClips } from "./runners/suggestClips";
import { runExportClip } from "./runners/exportClip";

interface QueueState {
  items: QueueItem[];
  running: boolean;
  sweeped: boolean;
}

const globalForQueue = globalThis as unknown as {
  __clipMeQueue?: QueueState;
};

function getQueueState(): QueueState {
  if (!globalForQueue.__clipMeQueue) {
    globalForQueue.__clipMeQueue = { items: [], running: false, sweeped: false };
  }
  const state = globalForQueue.__clipMeQueue;
  if (!state.sweeped) {
    state.sweeped = true;
    // Jobs left RUNNING from a killed process can never complete; fail them
    // so the UI doesn't show a permanently "stuck" spinner after a restart.
    void db.job.updateMany({
      where: { status: JobStatus.RUNNING },
      data: {
        status: JobStatus.FAILED,
        error: "Interrupted by server restart",
        finishedAt: new Date(),
      },
    });
  }
  return state;
}

export async function enqueueJob(params: EnqueueParams): Promise<string> {
  const job = await db.job.create({
    data: {
      type: params.type,
      status: JobStatus.QUEUED,
      sourceVideoId: params.sourceVideoId,
      exportedClipId: params.exportedClipId,
    },
  });

  const state = getQueueState();
  state.items.push({ jobId: job.id, ...params });
  void processQueue();

  return job.id;
}

async function processQueue(): Promise<void> {
  const state = getQueueState();
  if (state.running) return;
  state.running = true;
  try {
    while (state.items.length > 0) {
      const item = state.items.shift()!;
      await runJob(item);
    }
  } finally {
    state.running = false;
  }
}

async function runJob(item: QueueItem): Promise<void> {
  await db.job.update({
    where: { id: item.jobId },
    data: { status: JobStatus.RUNNING, startedAt: new Date() },
  });

  try {
    switch (item.type) {
      case JobType.DOWNLOAD:
        await runDownloadVideo(item.sourceVideoId!);
        break;
      case JobType.TRANSCRIBE:
        await runTranscribe(item.sourceVideoId!);
        break;
      case JobType.SUGGEST:
        await runSuggestClips(item.sourceVideoId!);
        break;
      case JobType.EXPORT:
        await runExportClip(item.exportedClipId!);
        break;
    }

    await db.job.update({
      where: { id: item.jobId },
      data: { status: JobStatus.SUCCEEDED, finishedAt: new Date() },
    });

    await chainNext(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Job ${item.jobId} (${item.type}) failed:`, err);
    await db.job.update({
      where: { id: item.jobId },
      data: { status: JobStatus.FAILED, error: message.slice(0, 2000), finishedAt: new Date() },
    });
  }
}

async function chainNext(item: QueueItem): Promise<void> {
  if (item.type === JobType.DOWNLOAD && item.sourceVideoId) {
    await enqueueJob({ type: JobType.TRANSCRIBE, sourceVideoId: item.sourceVideoId });
  } else if (item.type === JobType.TRANSCRIBE && item.sourceVideoId) {
    await enqueueJob({ type: JobType.SUGGEST, sourceVideoId: item.sourceVideoId });
  }
}
