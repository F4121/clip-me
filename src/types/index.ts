export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ClipSuggestion {
  startSeconds: number;
  endSeconds: number;
  title: string;
  rationale: string;
}
