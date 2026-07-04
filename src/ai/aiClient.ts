// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 AMOK / Europe Magic Wand

import type { AiConfig, AiChatMessage, GeneratePatternToolCall, AdjustDeviceToolCall } from './aiTypes';
import { SYSTEM_PROMPT, OPENAI_TOOLS, ANTHROPIC_TOOLS } from './aiPatternSkill';

export interface ChatCompletionResult {
  text: string;
  toolCall: GeneratePatternToolCall | null;
  adjustCall: AdjustDeviceToolCall | null;
}

export async function sendChatCompletion(
  config: AiConfig,
  messages: AiChatMessage[],
): Promise<ChatCompletionResult> {
  if (config.provider === 'anthropic') {
    return sendAnthropicCompletion(config, messages);
  }
  // OpenRouter and OpenAI both use OpenAI-compatible API
  return sendOpenAICompletion(config, messages);
}

async function sendOpenAICompletion(
  config: AiConfig,
  messages: AiChatMessage[],
): Promise<ChatCompletionResult> {
  const baseUrl = config.provider === 'openrouter'
    ? 'https://openrouter.ai/api/v1'
    : 'https://api.openai.com/v1';

  const apiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...(config.provider === 'openrouter' ? { 'HTTP-Referer': window.location.origin } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages: apiMessages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('No response from API');

  const message = choice.message;
  const text = message.content ?? '';
  let toolCall: GeneratePatternToolCall | null = null;
  let adjustCall: AdjustDeviceToolCall | null = null;

  if (message.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      try {
        const args = JSON.parse(tc.function.arguments);
        if (tc.function?.name === 'generate_pattern') {
          toolCall = args;
        } else if (tc.function?.name === 'adjust_device') {
          adjustCall = args;
        }
      } catch {
        // skip malformed tool calls
      }
    }
  }

  return { text, toolCall, adjustCall };
}

async function sendAnthropicCompletion(
  config: AiConfig,
  messages: AiChatMessage[],
): Promise<ChatCompletionResult> {
  const apiMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      system: SYSTEM_PROMPT,
      messages: apiMessages,
      tools: ANTHROPIC_TOOLS,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  let text = '';
  let toolCall: GeneratePatternToolCall | null = null;
  let adjustCall: AdjustDeviceToolCall | null = null;

  for (const block of data.content ?? []) {
    if (block.type === 'text') {
      text += block.text;
    }
    if (block.type === 'tool_use' && block.name === 'generate_pattern') {
      toolCall = block.input as GeneratePatternToolCall;
    }
    if (block.type === 'tool_use' && block.name === 'adjust_device') {
      adjustCall = block.input as AdjustDeviceToolCall;
    }
  }

  return { text, toolCall, adjustCall };
}
