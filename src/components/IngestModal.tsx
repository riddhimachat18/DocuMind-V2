import { useState } from "react";
import { toast } from "sonner";
import { ingestGmail, ingestSlack, getGoogleAccessToken } from "../services/ingestService";

interface Props {
  projectId: string;
  source: "gmail" | "slack";
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export default function IngestModal({ projectId, source, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);

  // Gmail state
  const [gmailQuery, setGmailQuery] = useState(
    "subject:(requirements OR project OR feature OR specification)"
  );
  const [gmailMax, setGmailMax] = useState(50);

  // Slack state
  const [channelInput, setChannelInput] = useState("");
  const [daysBack, setDaysBack] = useState(30);

  async function handleGmail() {
    setLoading(true);
    try {
      const { accessToken } = await getGoogleAccessToken();
      const result = await ingestGmail({ projectId, accessToken, query: gmailQuery, maxResults: gmailMax });
      toast.success(`Ingested ${result.snippetCount} snippets from Gmail`);
      onSuccess(result.snippetCount);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Gmail ingestion failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSlack() {
    const ids = channelInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) { toast.error("Enter at least one channel ID"); return; }

    setLoading(true);
    try {
      const result = await ingestSlack({ projectId, channelIds: ids, daysBack });
      toast.success(`Ingested ${result.snippetCount} snippets from Slack`);
      onSuccess(result.snippetCount);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Slack ingestion failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {source === "gmail" ? "✉ Ingest from Gmail" : "# Ingest from Slack"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {source === "gmail" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Connects via Google OAuth (read-only). Threads are classified at ingest — only
                REQUIREMENT, DECISION, and CONSTRAINT snippets are stored.
              </p>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Search query</label>
                <input
                  value={gmailQuery}
                  onChange={(e) => setGmailQuery(e.target.value)}
                  className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary transition-colors"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Max threads</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={gmailMax}
                  onChange={(e) => setGmailMax(Number(e.target.value))}
                  className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary transition-colors"
                  disabled={loading}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Uses your Slack Bot Token (configured server-side). Paste channel IDs separated by
                commas or spaces. Messages are classified at ingest — NOISE is discarded.
              </p>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">
                  Channel IDs (e.g. C012AB3CD)
                </label>
                <input
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  placeholder="C012AB3CD, C034EF5GH"
                  className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary transition-colors"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Days of history</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={daysBack}
                  onChange={(e) => setDaysBack(Number(e.target.value))}
                  className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary transition-colors"
                  disabled={loading}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-sm border border-border px-4 py-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={source === "gmail" ? handleGmail : handleSlack}
            disabled={loading}
            className="text-sm bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Ingesting…" : "Start Ingestion"}
          </button>
        </div>
      </div>
    </div>
  );
}
