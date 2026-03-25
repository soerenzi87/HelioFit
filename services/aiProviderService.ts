/**
 * AI Provider Abstraction Layer
 * Routes AI requests to Gemini, OpenAI, or Claude based on user preference.
 * All providers receive the same prompt and return plain text (JSON string).
 */

import { UserProfile } from '../types';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type AIProvider = 'gemini' | 'openai' | 'claude';

export interface AIRequestOptions {
  prompt: string;
  jsonSchema?: any; // Used by Gemini; OpenAI/Claude get schema instruction in prompt
  maxRetries?: number;
  profile?: UserProfile;
  thinkingBudget?: number;
}

export interface AIResponse {
  text: string;
}

// ── Resolve which provider + key to use ──
export function resolveProvider(profile?: UserProfile): { provider: AIProvider; apiKey: string } {
  const preferred = profile?.aiConfig?.preferredProvider || 'gemini';

  // Try preferred first, then fall back
  const keys: Record<AIProvider, string | undefined> = {
    gemini: profile?.aiConfig?.geminiKey || process.env.API_KEY || process.env.GEMINI_API_KEY,
    openai: profile?.aiConfig?.openaiKey || process.env.OPENAI_API_KEY,
    claude: profile?.aiConfig?.claudeKey || process.env.ANTHROPIC_API_KEY,
  };

  if (keys[preferred]) {
    return { provider: preferred, apiKey: keys[preferred]! };
  }

  // Fallback: try any available key
  for (const p of ['gemini', 'openai', 'claude'] as AIProvider[]) {
    if (keys[p]) return { provider: p, apiKey: keys[p]! };
  }

  throw new Error('No AI API key configured. Please add a key in settings.');
}

// ── OpenAI call ──
async function callOpenAI(prompt: string, apiKey: string, jsonSchema?: any, maxRetries = 2): Promise<string> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const systemMsg = jsonSchema
    ? `You are a helpful fitness & nutrition AI assistant. You MUST respond with valid JSON only, no markdown. Follow this JSON structure exactly:\n${JSON.stringify(jsonSchema, null, 2)}`
    : 'You are a helpful fitness & nutrition AI assistant. Respond with valid JSON only, no markdown.';

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      });
      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('Empty response from OpenAI');
      return text;
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      if ((msg.includes('429') || msg.includes('rate')) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ── Claude call ──
async function callClaude(prompt: string, apiKey: string, jsonSchema?: any, maxRetries = 2): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const systemMsg = jsonSchema
    ? `You are a helpful fitness & nutrition AI assistant. You MUST respond with valid JSON only, no markdown fences. Follow this JSON structure exactly:\n${JSON.stringify(jsonSchema, null, 2)}`
    : 'You are a helpful fitness & nutrition AI assistant. Respond with valid JSON only, no markdown fences.';

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemMsg,
        messages: [{ role: 'user', content: prompt }],
      });
      const textBlock = response.content.find((b: any) => b.type === 'text');
      const text = textBlock ? (textBlock as any).text : '';
      if (!text) throw new Error('Empty response from Claude');
      return text;
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      if ((msg.includes('429') || msg.includes('rate') || msg.includes('overloaded')) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ── Build a plain-text schema description from Gemini Type schema ──
export function schemaToDescription(schema: any): any {
  if (!schema) return undefined;
  // Convert the Gemini Type-based schema to a plain JSON description for OpenAI/Claude
  const convert = (s: any): any => {
    if (!s) return 'any';
    if (s.type === 'OBJECT' || s.type === 'object') {
      const obj: any = {};
      for (const [key, val] of Object.entries(s.properties || {})) {
        obj[key] = convert(val);
      }
      return obj;
    }
    if (s.type === 'ARRAY' || s.type === 'array') {
      return [convert(s.items)];
    }
    return s.type?.toLowerCase() || 'string';
  };
  return convert(schema);
}

// ── Main unified call function ──
export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  const { prompt, jsonSchema, maxRetries = 2, profile } = options;
  const { provider, apiKey } = resolveProvider(profile);

  if (provider === 'openai') {
    const schemaDesc = schemaToDescription(jsonSchema);
    const text = await callOpenAI(prompt, apiKey, schemaDesc, maxRetries);
    return { text };
  }

  if (provider === 'claude') {
    const schemaDesc = schemaToDescription(jsonSchema);
    const text = await callClaude(prompt, apiKey, schemaDesc, maxRetries);
    return { text };
  }

  // Gemini is handled by the existing callGeminiWithRetry in geminiService.ts
  // This should not be reached — Gemini calls go through the existing path
  throw new Error('Gemini calls should use the existing callGeminiWithRetry path');
}
