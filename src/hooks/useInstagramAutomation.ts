import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { Automation, InboxMessage } from '../types';

export interface UseInstagramAutomationReturn {
  isProcessing: boolean;
  lastResponseLatencyMs: number | null;
  sendFastTestMessage: (username: string, text: string, triggerType?: 'dm' | 'comment' | 'story_reply') => Promise<{
    success: boolean;
    replyText: string;
    latencyMs: number;
  }>;
  generateInstantAiReply: (incomingText: string, senderUsername: string, systemInstruction?: string) => Promise<{
    reply: string;
    latencyMs: number;
    usedKeyLabel: string;
  }>;
}

/**
 * Custom React Hook for Sub-Second Instagram Automation & Instant AI DM Handling
 */
export function useInstagramAutomation(): UseInstagramAutomationReturn {
  const { automations, inboxMessages, simulateWebhookEvent } = useApp();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResponseLatencyMs, setLastResponseLatencyMs] = useState<number | null>(null);

  /**
   * Fast Simulation Dispatch (via Express / Cloud Functions backend)
   */
  const sendFastTestMessage = useCallback(
    async (username: string, text: string, triggerType: 'dm' | 'comment' | 'story_reply' = 'dm') => {
      setIsProcessing(true);
      const start = performance.now();
      try {
        const res = await simulateWebhookEvent(triggerType, username, text);
        const elapsed = Math.round(performance.now() - start);
        setLastResponseLatencyMs(elapsed);
        return {
          success: res.status !== 'error',
          replyText: res.response_sent || '',
          latencyMs: elapsed,
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [simulateWebhookEvent]
  );

  /**
   * Direct AI Reply Generator
   * Uses the server-side OpenAI endpoint with minimal recent context.
   */
  const generateInstantAiReply = useCallback(
    async (incomingText: string, senderUsername: string, systemInstruction?: string) => {
      setIsProcessing(true);
      const start = performance.now();
      try {
        const cleanUser = senderUsername.replace(/^@/, '').toLowerCase().trim();
        const recentHistory = (inboxMessages || [])
          .filter((m: InboxMessage) => m?.from_username?.toLowerCase() === cleanUser)
          .sort((a, b) => new Date(a?.timestamp || 0).getTime() - new Date(b?.timestamp || 0).getTime())
          .slice(-2)
          .map((m) => ({
            role: m.direction === 'in' ? 'user' : 'assistant',
            content: m.message_text || '',
          }));

        const response = await fetch('/api/openai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            text: incomingText,
            history: recentHistory,
            systemInstruction:
              systemInstruction ||
              'You are a friendly Instagram assistant. Reply politely and concisely.',
            maxReplyLength: 'Short',
            language: 'Auto Detect',
            personality: 'Friendly',
            assistantName: 'AI Assistant',
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || 'AI reply failed.');
        }

        const elapsed = Math.round(performance.now() - start);
        setLastResponseLatencyMs(elapsed);

        return {
          reply: String(payload.reply || ''),
          latencyMs: elapsed,
          usedKeyLabel: 'GPT-4o mini',
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [inboxMessages]
  );

  return {
    isProcessing,
    lastResponseLatencyMs,
    sendFastTestMessage,
    generateInstantAiReply,
  };
}
