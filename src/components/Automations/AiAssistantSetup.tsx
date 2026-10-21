import React from "react";
import {
  ArrowLeft,
  Bot,
  Camera,
  CheckCircle2,
  Circle,
  Image as ImageIcon,
  Info,
  Mic,
  MoreHorizontal,
  Phone,
  Send,
  Smile,
  Video,
} from "lucide-react";
import { CatalogPreview } from "../Catalog/CatalogPicker";
import { useApp } from "../../context/AppContext";
import { GoogleSheetsSetup } from "./GoogleSheetsSetup";

export type AiAssistantSetupProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  testInput: string;
  onTestInputChange: (value: string) => void;
  testMessage: string;
  testReply: string;
  testError: string;
  testing: boolean;
  onTest: () => void;
  testImage?:string;
  testSentImage?:string;
  testCatalog?:any;
  testWarning?:string;
  onTestImageChange?:(file:File|null)=>void;
  onClearTest?:()=>void;
  dataControls?: React.ReactNode;
  promptTools: React.ReactNode;
  replySettings: React.ReactNode;
};

const promptTips = [
  {
    label: "Business details",
    text: "Business details: Describe your products, prices, delivery areas and policies here.",
  },
  {
    label: "Reply tone",
    text: "Reply tone: Be friendly, clear and concise. Match the customer’s language.",
  },
  {
    label: "Order questions",
    text: "Order questions: Ask for the customer’s name, selected product and delivery city when they want to order.",
  },
];

export const AiAssistantSetup = (p: AiAssistantSetupProps) => {
  const { instagramAccount } = useApp();
  const username = instagramAccount?.username || "your_business";
  const avatar = instagramAccount?.profile_pic_url || "";
  const initials = username.replace(/^@/, "").slice(0, 2).toUpperCase() || "IG";

  return (
    <section aria-labelledby="ai-setup-title">
      <div className="ai-setup-heading">
        <div>
          <p className="eyebrow">Step 3 of 4 · AI DM</p>
          <h2 id="ai-setup-title">Set up your AI assistant</h2>
          <p>
            Tell your assistant how to reply, then test it in a real
            Instagram-style conversation before going live.
          </p>
        </div>
        <span className="ai-preview-label">Setup</span>
      </div>

      <div className="ai-setup-grid">
        <div className="ai-setup-primary">
          <section className="ai-setup-card" aria-labelledby="prompt-heading">
            <h3 id="prompt-heading">System prompt</h3>
            <p className="mb-3 text-xs leading-5 text-slate-500">Describe when a human should take over. AI can hand off the conversation, notify an administrator and remain paused until Resume AI is selected.</p>
            <label htmlFor="ai-system-prompt">
              Instructions for your assistant{" "}
              <span className="text-slate-500">(required)</span>
            </label>
            <p id="ai-prompt-hint">
              Add your business details, reply rules and the information
              customers should share.
            </p>
            <textarea
              id="ai-system-prompt"
              aria-describedby="ai-prompt-hint"
              value={p.prompt}
              onChange={(e) => p.onPromptChange(e.target.value)}
              rows={10}
              placeholder="You are the assistant for my business. Help customers with products, prices and orders. Never invent information. Offer human support when unsure."
            />
            <div className="ai-prompt-count">
              {p.prompt.length.toLocaleString()} characters
            </div>
            <div className="ai-prompt-tips">
              {promptTips.map((tip) => (
                <button
                  key={tip.label}
                  type="button"
                  onClick={() => {
                    if (!p.prompt.includes(tip.text))
                      p.onPromptChange(
                        p.prompt + (p.prompt.trim() ? "\n\n" : "") + tip.text,
                      );
                  }}
                >
                  {tip.label} <span aria-hidden="true">+</span>
                </button>
              ))}
            </div>
            <details className="ai-setup-details">
              <summary>Review and improve instructions</summary>
              {p.promptTools}
            </details>
          </section>

          {p.dataControls}
          <GoogleSheetsSetup />

          {p.replySettings}
        </div>

        <aside
          className="ai-setup-preview"
          aria-label="Assistant test and readiness"
        >
          <section
            className="ai-phone-preview-section"
            aria-labelledby="test-assistant-heading"
          >
            <div className="ai-phone-preview-heading">
              <div>
                <h3 id="test-assistant-heading">Test your assistant</h3>
                <p>
                  Chat with your AI exactly like a customer would in Instagram
                  DMs.
                </p>
              </div>
              <span className="ai-preview-label">Preview only</span>
            </div>

            <div className="ai-phone-shell">
              <div className="ai-phone-bezel">
                <div className="ai-phone-screen">
                  <div className="ai-phone-statusbar" aria-hidden="true">
                    <span>9:41</span>
                    <span className="ai-phone-island" />
                    <span className="ai-phone-status-icons">
                      5G&nbsp; ▮▮▮ &nbsp;●
                    </span>
                  </div>

                  <div className="ai-instagram-header">
                    <button type="button" tabIndex={-1} aria-hidden="true">
                      <ArrowLeft />
                    </button>
                    <div className="ai-instagram-profile">
                      <span className="ai-instagram-avatar">
                        {avatar ? (
                          <img src={avatar} alt="" />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </span>
                      <span className="ai-instagram-profile-copy">
                        <strong>@{username.replace(/^@/, "")}</strong>
                        <small>
                          {instagramAccount?.status === "connected"
                            ? "Active now"
                            : "Instagram business"}
                        </small>
                      </span>
                    </div>
                    <div className="ai-instagram-actions" aria-hidden="true">
                      <Phone />
                      <Video />
                      <MoreHorizontal />
                    </div>
                  </div>

                  <div className="ai-instagram-chat" aria-live="polite">
                    {!p.testMessage && !p.testReply && !p.testing && (
                      <div className="ai-instagram-profile-card">
                        <span className="ai-instagram-avatar ai-instagram-avatar-large">
                          {avatar ? (
                            <img src={avatar} alt="" />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </span>
                        <strong>@{username.replace(/^@/, "")}</strong>
                        <span>Instagram business account</span>
                        <small>
                          This is a safe preview. Nothing is sent to Instagram.
                        </small>
                      </div>
                    )}

                    {p.testMessage && (
                      <div className="ai-ig-message-row ai-ig-message-row-user">
                        <div className="ai-ig-bubble ai-ig-bubble-user">
                          {p.testSentImage&&<img src={p.testSentImage} alt="Customer test product" className="mb-2 max-h-40 max-w-full rounded-lg object-contain"/>}{p.testMessage}
                        </div>
                      </div>
                    )}

                    {p.testing && (
                      <div className="ai-ig-message-row ai-ig-message-row-business">
                        <span className="ai-ig-mini-avatar">
                          {avatar ? <img src={avatar} alt="" /> : <Bot />}
                        </span>
                        <div
                          className="ai-ig-bubble ai-ig-bubble-business ai-ig-typing"
                          aria-label="AI is typing"
                        >
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    )}

                    {!p.testing && p.testReply && (
                      <div className="ai-ig-message-row ai-ig-message-row-business">
                        <span className="ai-ig-mini-avatar">
                          {avatar ? <img src={avatar} alt="" /> : <Bot />}
                        </span>
                        <div className="ai-ig-bubble ai-ig-bubble-business">
                          {p.testCatalog?.elements?.length?<CatalogPreview products={p.testCatalog.elements.map((card:any,i:number)=>({id:String(i),name:card.title,images:[card.image_url],description:card.subtitle||'',price:'',url:card.buttons?.[0]?.url||'',active:true}))}/>:p.testReply}
                        </div>
                      </div>
                    )}

                    {p.testError && (
                      <div className="ai-ig-preview-error" role="alert">
                        {p.testError}
                      </div>
                    )}
                  </div>

                  <form
                    className="ai-instagram-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      p.onTest();
                    }}
                  >
                    <label className="ai-ig-camera-button cursor-pointer" title="Test with a product photo"><Camera/><input aria-label="Test product image" type="file" accept="image/jpeg,image/png,image/webp" disabled={p.testing} className="sr-only" onChange={e=>{p.onTestImageChange?.(e.target.files?.[0]||null);e.target.value='';}}/></label>
                    <label className="sr-only" htmlFor="ai-test-message">
                      Test customer message
                    </label>
                    <input
                      id="ai-test-message"
                      disabled={p.testing}
                      value={p.testInput}
                      onChange={(e) => p.onTestInputChange(e.target.value)}
                      placeholder="Message..."
                      autoComplete="off"
                    />
                    {p.testInput.trim()||p.testImage ? (
                      <button
                        type="submit"
                        className="ai-ig-send-button"
                        aria-label="Send test message"
                        disabled={p.testing || !p.prompt.trim()}
                      >
                        Send
                      </button>
                    ) : (
                      <div className="ai-ig-composer-tools" aria-hidden="true">
                        <Mic />
                        <ImageIcon />
                        <Smile />
                      </div>
                    )}
                  </form>
                </div>
              </div>
            </div>

            {p.testImage&&<div className="mt-3 flex items-center gap-3 text-xs"><img src={p.testImage} alt="Selected test product image" className="h-14 w-14 rounded-lg object-cover"/><span>Photo ready · Up to 2 MB</span><button disabled={p.testing} onClick={()=>p.onTestImageChange?.(null)} className="rounded-lg border px-2 py-1">Remove</button></div>}
            {p.testWarning&&<p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{p.testWarning}</p>}
            {p.onClearTest&&<button disabled={p.testing} onClick={p.onClearTest} className="mt-3 rounded-lg border px-3 py-2 text-xs">New test conversation</button>}
            <p className="ai-phone-preview-note">
              <Info size={15} /> Test messages stay inside this preview. AI test
              usage may count toward your allowance.
            </p>
          </section>

          <section className="ai-setup-card">
            <h3>Before you publish</h3>
            <div className="ai-readiness">
              {p.prompt.trim() ? <CheckCircle2 /> : <Circle />}
              <span>Instructions {p.prompt.trim() ? "added" : "required"}</span>
            </div>
            <div className="ai-readiness">
              {p.testReply ? <CheckCircle2 /> : <Circle />}
              <span>
                {p.testReply
                  ? "Test reply received"
                  : "Try a test reply (recommended)"}
              </span>
            </div>
            <p className="ai-setup-note">
              Review your instructions before switching this automation on.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
};
