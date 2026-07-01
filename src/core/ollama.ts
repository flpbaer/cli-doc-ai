export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

export interface OllamaOptions {
  model: string;
  baseUrl?: string;
  maxTokens?: number;
}

/**
 * Lists model tags already pulled on the local Ollama server.
 */
export async function listOllamaModels(baseUrl = DEFAULT_OLLAMA_BASE_URL): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama API error ${response.status} while listing models`);
  }
  const data = (await response.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

/**
 * Sends a prompt to a local Ollama server (no API key — runs on this machine).
 */
export async function callOllama(prompt: string, opts: OllamaOptions): Promise<string> {
  const baseUrl = opts.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_predict: opts.maxTokens ?? 2048 },
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach Ollama at ${baseUrl}. Is "ollama serve" running?\n` +
      `Underlying error: ${(err as Error).message}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { message?: { content?: string } };
  const content = data?.message?.content;
  if (!content) throw new Error(`Empty response from Ollama: ${JSON.stringify(data)}`);
  return content.trim();
}
