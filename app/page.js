"use client";

import { useMemo, useState } from "react";

const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://localhost:3000";

const getStatusVariant = (statusType) => {
  if (statusType === "error") return "error";
  if (statusType === "success") return "success";
  return "info";
};

export default function HomePage() {
  const [topic, setTopic] = useState("");
  const [contextChunks, setContextChunks] = useState([]);
  const [post, setPost] = useState("");
  const [editedPost, setEditedPost] = useState("");
  const [step, setStep] = useState("input");
  const [status, setStatus] = useState({ message: "Enter a topic and generate a post.", type: "info" });
  const [isLoading, setIsLoading] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [approved, setApproved] = useState(false);

  const canGenerate = topic.trim().length > 3 && !isLoading;
  const scheduleTimestamp = useMemo(() => {
    if (!scheduledTime) return null;
    return new Date(scheduledTime).toISOString();
  }, [scheduledTime]);

  const clearWorkflow = () => {
    setContextChunks([]);
    setPost("");
    setEditedPost("");
    setStep("input");
    setIsLoading(false);
    setApproved(false);
    setScheduledTime("");
    setStatus({ message: "Enter a topic and generate a post.", type: "info" });
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsLoading(true);
    setStatus({ message: "Fetching context for your topic...", type: "info" });
    setStep("loading");

    try {
      const contextResponse = await fetch(`${backendBaseUrl}/get-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      if (!contextResponse.ok) {
        throw new Error("Could not load context. Check your backend.");
      }
      const contextData = await contextResponse.json();
      const chunks = Array.isArray(contextData.context) ? contextData.context : [];
      setContextChunks(chunks.slice(0, 8));

      setStatus({ message: "Generating draft post from context...", type: "info" });

      const generationResponse = await fetch(`${backendBaseUrl}/generate-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), context: chunks }),
      });
      if (!generationResponse.ok) {
        throw new Error("Post generation failed. Check your backend.");
      }
      const generationData = await generationResponse.json();
      const generated = generationData.post || generationData.content || generationData.output || generationData.text;
      if (!generated) {
        throw new Error("No post returned from generation API.");
      }

      setPost(generated);
      setEditedPost(generated);
      setStep("review");
      setStatus({ message: "Post generated. Review, edit, or approve it.", type: "success" });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "Unexpected error.", type: "error" });
      setStep("input");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!post.trim()) return;
    setIsLoading(true);
    setStatus({ message: "Scheduling approved post...", type: "info" });

    try {
      const scheduleBody = {
        content: editedPost.trim() || post.trim(),
        time: scheduleTimestamp || new Date(Date.now() + 60 * 1000).toISOString(),
      };
      const scheduleResponse = await fetch(`${backendBaseUrl}/schedule-post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleBody),
      });
      if (!scheduleResponse.ok) {
        throw new Error("Scheduler API failed. Check your backend or fallback.");
      }
      await scheduleResponse.json();
      setApproved(true);
      setStep("scheduled");
      setStatus({ message: "Post approved and scheduled successfully.", type: "success" });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "Schedule failed.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestChange = () => {
    setStep("edit");
    setStatus({ message: "Edit the post text below, then approve or regenerate.", type: "info" });
  };

  const handleDiscard = () => {
    clearWorkflow();
    setStatus({ message: "Post discarded. Start again with a new topic.", type: "error" });
  };

  return (
    <div className="page-shell">
      <header className="header">
        <div>
          <div className="brand">ANDREV</div>
        </div>
      </header>

      <section className="card">
        <div className="field">
          <label htmlFor="topicInput">Topic</label>
          <input
            id="topicInput"
            className="input"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. AI in startups, founder storytelling, product-led growth"
          />
        </div>

        <div className="button-row">
          <button className="btn primary" onClick={handleGenerate} disabled={!canGenerate || isLoading}>
            {isLoading && step === "loading" ? "Working..." : "Generate post"}
          </button>
          <button className="btn secondary" onClick={clearWorkflow} disabled={isLoading}>
            Reset
          </button>
          <span className={`status ${getStatusVariant(status.type)}`}>{status.message}</span>
        </div>
      </section>

      {step !== "input" && contextChunks.length > 0 ? (
        <section className="card">
          <h2>Context returned</h2>
          <p>These are the most relevant voice/context chunks for this topic.</p>
          <div className="chip-list">
            {contextChunks.map((chunk, index) => (
              <div key={index} className="chip">
                {chunk.length > 64 ? `${chunk.slice(0, 64)}…` : chunk}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {step === "review" || step === "edit" || step === "scheduled" ? (
        <section className="card">
          <h2>Post review</h2>
          <div className="field">
            <label htmlFor="postEditor">Draft post</label>
            <textarea
              id="postEditor"
              className="textarea"
              value={editedPost}
              onChange={(event) => setEditedPost(event.target.value)}
              readOnly={step === "scheduled"}
            />
          </div>

          <div className="field">
            <label htmlFor="scheduleTime">Schedule time (optional)</label>
            <input
              id="scheduleTime"
              type="datetime-local"
              className="input"
              value={scheduledTime}
              onChange={(event) => setScheduledTime(event.target.value)}
            />
            <p style={{ color: "#475569", fontSize: "0.95rem", marginTop: "8px" }}>
              If empty, the app will schedule the post one minute from now.
            </p>
          </div>

          <div className="button-row">
            <button className="btn primary" onClick={handleApprove} disabled={isLoading || step === "scheduled"}>
              Approve & schedule
            </button>
            <button className="btn tertiary" onClick={handleRequestChange} disabled={isLoading || step === "scheduled"}>
              Request change
            </button>
            <button className="btn secondary" onClick={handleDiscard} disabled={isLoading}>
              Discard
            </button>
          </div>
        </section>
      ) : null}

      {step === "scheduled" && (
        <section className="card">
          <h2>Post scheduled</h2>
          <p>Your approved post is now in the scheduler queue.</p>
          <div className="field">
            <label>Final topic</label>
            <div className="chip">{topic}</div>
          </div>
          <div className="field">
            <label>Scheduled time</label>
            <div className="chip">{scheduleTimestamp || new Date(Date.now() + 60 * 1000).toLocaleString()}</div>
          </div>
        </section>
      )}
    </div>
  );
}
