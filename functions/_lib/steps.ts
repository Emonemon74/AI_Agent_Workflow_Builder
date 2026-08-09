import { interpolate, getByPath, withRetry } from './util';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL_DEFAULT = 'llama-3.1-8b-instant';

export interface StepConfig {
  [key: string]: any;
}

export interface StepResult {
  input: unknown;
  output: unknown;
  attempts?: number;
}

async function runLlmCall(config: StepConfig, previousOutput: unknown): Promise<StepResult> {
  const prompt = interpolate(config.prompt ?? '', previousOutput);
  const model = config.model || GROQ_MODEL_DEFAULT;
  const input = { prompt, model };

  if (!GROQ_API_KEY) {
    // Disclosed stub path — used when no Groq key is configured (see README).
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      input,
      output: { text: `[stubbed llm response for prompt: ${prompt.slice(0, 80)}]`, stubbed: true },
      attempts: 1,
    };
  }

  const call = async () => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(config.systemPrompt ? [{ role: 'system', content: config.systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Groq API error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  };

  const { value: data, attempts } = await withRetry(call, 1);
  const text = data.choices?.[0]?.message?.content ?? '';
  return { input, output: { text, raw: data }, attempts };
}

async function runHttpRequest(config: StepConfig, previousOutput: unknown): Promise<StepResult> {
  const url = interpolate(config.url ?? '', previousOutput);
  const method = config.method || 'GET';
  const body = config.body ? interpolate(JSON.stringify(config.body), previousOutput) : undefined;
  const input = { url, method, headers: config.headers, body };

  const call = async () => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave as raw text
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    return { status: res.status, body: parsed };
  };

  const { value: output, attempts } = await withRetry(call, 1);
  return { input, output, attempts };
}

async function runConditionalBranch(config: StepConfig, previousOutput: unknown): Promise<StepResult & { matched: boolean }> {
  const value = getByPath(previousOutput, config.path);
  let matched: boolean;
  switch (config.operator || 'eq') {
    case 'contains':
      matched = typeof value === 'string' && value.includes(String(config.value));
      break;
    case 'neq':
      matched = value !== config.value;
      break;
    default:
      matched = value === config.value;
  }
  const input = { path: config.path, operator: config.operator || 'eq', expected: config.value, actual: value };
  return { input, output: { matched }, matched };
}

export const executors = {
  llm_call: runLlmCall,
  http_request: runHttpRequest,
  conditional_branch: runConditionalBranch,
};
