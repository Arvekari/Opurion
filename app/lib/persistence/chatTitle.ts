import type { Message } from 'ai';

const MAX_CHAT_TITLE_LENGTH = 80;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripPromptMarkup(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]+\]\([^\)]+\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
}

function truncateTitle(value: string): string {
  if (value.length <= MAX_CHAT_TITLE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_CHAT_TITLE_LENGTH - 3).trimEnd()}...`;
}

export function extractMessageText(message: Message): string {
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content;
  }

  const parts = Array.isArray(message.parts)
    ? message.parts
    : Array.isArray(message.content)
      ? message.content
      : [];

  return parts
    .filter((part: any) => typeof part === 'object' && part !== null && 'type' in part && part.type === 'text')
    .map((part: any) => (typeof part.text === 'string' ? part.text : ''))
    .join(' ')
    .trim();
}

export function deriveChatTitleFromMessages(messages: Message[], fallbackTitle?: string): string | undefined {
  const firstUserMessage = messages.find((message) => message.role === 'user' && !message.annotations?.includes('no-store'));
  const rawText = firstUserMessage ? extractMessageText(firstUserMessage) : fallbackTitle;

  if (!rawText) {
    return fallbackTitle;
  }

  const firstLine = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  const cleaned = normalizeWhitespace(stripPromptMarkup(firstLine || rawText)).replace(/^[-:>"'`]+|[-:>"'`]+$/g, '');

  if (!cleaned) {
    return fallbackTitle;
  }

  return truncateTitle(cleaned);
}
