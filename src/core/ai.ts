import { callOpenRouter } from './openrouter.js';
import { callOllama } from './ollama.js';
import type { Language } from './prompts.js';

export type Provider = 'openrouter' | 'ollama';

export interface AIOptions {
  provider: Provider;
  model: string;
  maxTokens?: number;
  // openrouter-only
  apiKey?: string;
  repoName?: string;
  // ollama-only
  baseUrl?: string;
}

/**
 * Dispatches a prompt to whichever provider was selected (OpenRouter or a
 * local Ollama server), so the rest of the CLI doesn't need to know which
 * one is behind `opts`.
 */
export async function callAI(prompt: string, opts: AIOptions): Promise<string> {
  if (opts.provider === 'ollama') {
    return callOllama(prompt, {
      model: opts.model,
      baseUrl: opts.baseUrl,
      maxTokens: opts.maxTokens,
    });
  }

  if (!opts.apiKey) {
    throw new Error('Missing OpenRouter API key.');
  }
  return callOpenRouter(prompt, {
    apiKey: opts.apiKey,
    model: opts.model,
    repoName: opts.repoName,
    maxTokens: opts.maxTokens,
  });
}

// Common function words used to guess whether a text is English or
// Brazilian Portuguese. Not linguistically rigorous — just enough to catch
// a model that ignored the language instruction in the prompt.
const EN_MARKERS = [' the ', ' and ', ' is ', ' with ', ' this ', ' that ', ' for ', ' are ', ' you ', ' your ', ' have '];
const PT_MARKERS = [' de ', ' para ', ' não ', ' com ', ' uma ', ' mais ', ' você ', ' está ', ' são ', ' isso ', ' então ', ' também ', ' que '];

function detectLanguage(text: string): Language | 'unknown' {
  const lower = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const count = (markers: string[]) => markers.reduce((n, m) => n + (lower.split(m).length - 1), 0);
  const enScore = count(EN_MARKERS);
  const ptScore = count(PT_MARKERS);
  if (enScore === 0 && ptScore === 0) return 'unknown';
  return ptScore > enScore ? 'pt-BR' : 'en';
}

function matchesLanguage(text: string, lang: Language): boolean {
  const detected = detectLanguage(text);
  return detected === 'unknown' || detected === lang;
}

/**
 * Generates text and guarantees it comes back in the requested language,
 * regardless of whether the underlying model actually followed the
 * instruction in the prompt — if the detected language doesn't match, the
 * output is translated in a second, much simpler pass.
 */
export async function generateInLanguage(
  prompt: string,
  opts: AIOptions,
  lang: Language
): Promise<string> {
  const text = await callAI(prompt, opts);
  if (matchesLanguage(text, lang)) return text;

  const targetName = lang === 'pt-BR' ? 'Brazilian Portuguese (pt-BR)' : 'English';
  const translatePrompt =
    `Translate the document below to ${targetName}. Preserve the Markdown structure ` +
    `(headers, lists, code blocks) exactly — translate only the natural-language text, ` +
    `and do not translate code inside code blocks. Return ONLY the translated document, ` +
    `nothing else, no preamble.\n\n---\n\n${text}`;

  return callAI(translatePrompt, { ...opts, maxTokens: Math.ceil((opts.maxTokens ?? 2048) * 1.3) });
}
