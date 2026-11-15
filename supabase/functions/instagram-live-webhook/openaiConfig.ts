/** Shared provider contract for live DMs, preview, extraction and memory. */
export const DM_AI_MODEL = 'gpt-5.6-luna';
export const MAX_BUSINESS_PROMPT_CHARS = 60000;
export function businessPrompt(value:unknown, fallback='You are a helpful Instagram assistant. Reply briefly about this business.') {
 const prompt=String(value||fallback).trim();
 if(prompt.length>MAX_BUSINESS_PROMPT_CHARS)throw Error('Business instructions exceed 60,000 characters. Shorten them before saving; instructions are never silently cut.');
 return prompt;
}
export function chatModelParams(maxVisibleTokens=600, model=DM_AI_MODEL, effort:'low'|'none'='low') {
 return {model,reasoning_effort:effort,max_completion_tokens:Math.max(4096,maxVisibleTokens+2048)};
}
