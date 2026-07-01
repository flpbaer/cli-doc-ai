const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

// Fallback chain: if the primary model is rate-limited, tries the next one.
// Spread across different upstream providers on purpose — several free
// models route through the same provider (e.g. Venice), so when that
// provider is congested, every model on it 429s at once.
export const FREE_MODEL_FALLBACKS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'nvidia/nemotron-nano-9b-v2:free',
];

export interface OpenRouterOptions {
  apiKey: string;
  model?: string;
  repoName?: string;
  maxTokens?: number;
}

export interface PRContext {
  prNumber: string;
  prTitle: string;
  prAuthor: string;
  prUrl: string;
  version: string;
  repoName: string;
  commits: string;
  diffStat: string;
  diffContent: string;
}

async function fetchModel(
  prompt: string,
  model: string,
  opts: OpenRouterOptions
): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': `https://github.com/${opts.repoName ?? ''}`,
      'X-Title': 'cli-doc-ai',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });
}

/**
 * Low-level: sends any prompt to OpenRouter.
 * If the chosen model is rate-limited (429) or unavailable (404),
 * automatically retries with the next model in the free fallback chain.
 */
export async function callOpenRouter(
  prompt: string,
  opts: OpenRouterOptions
): Promise<string> {
  const requestedModel = opts.model ?? DEFAULT_MODEL;

  // Build the list of models to try: requested first, then fallbacks (deduped)
  const queue = [
    requestedModel,
    ...FREE_MODEL_FALLBACKS.filter((m) => m !== requestedModel),
  ];

  let lastError = '';

  for (const model of queue) {
    if (model !== requestedModel) {
      process.stderr.write(`[openrouter] Retrying with ${model}...\n`);
    }

    const response = await fetchModel(prompt, model, opts);

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data?.choices?.[0]?.message?.content;
      if (content) return content.trim();
      lastError = 'Empty response: ' + JSON.stringify(data);
      continue;
    }

    const errorText = await response.text();

    // Only retry on rate-limit or not-found errors
    if (response.status === 429 || response.status === 404) {
      lastError = `${response.status} on ${model}: ${errorText}`;
      continue;
    }

    // Any other error (401, 500, etc.) — fail immediately
    throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
  }

  throw new Error(
    `All models exhausted. Last error: ${lastError}\n` +
    `Consider setting a paid model via OPENROUTER_MODEL in your .env`
  );
}

/**
 * High-level: generates a PR/changes summary (kept for Action compatibility).
 */
export async function generateSummary(
  ctx: PRContext,
  opts: OpenRouterOptions
): Promise<string> {
  const { promptChanges } = await import('./prompts.js');
  return callOpenRouter(promptChanges(ctx, 'en'), { ...opts, maxTokens: 1024 });
}
