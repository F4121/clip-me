import { VideoUrlForm } from "@/components/VideoUrlForm";

export default function NewVideoPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start px-4 py-8">
      <h1 className="text-2xl font-semibold">New Clip</h1>
      <p className="mt-1 text-zinc-600">
        Paste a YouTube URL. We&apos;ll download it, transcribe it locally, and
        suggest a few 30-60s clips to turn vertical.
      </p>
      <div className="mt-6">
        <VideoUrlForm />
      </div>
    </div>
  );
}
