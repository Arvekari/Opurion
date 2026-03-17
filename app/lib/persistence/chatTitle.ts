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

function extractAssistantHeader(rawAssistantText: string): string | undefined {
  if (!rawAssistantText) {
    return undefined;
  }

  const artifactTitleMatch =
    rawAssistantText.match(/<boltArtifact[^>]*\btitle="([^"]+)"/i) ||
    rawAssistantText.match(/<boltArtifact[^>]*\btitle='([^']+)'/i);

  if (artifactTitleMatch?.[1]?.trim()) {
    return artifactTitleMatch[1].trim();
  }

  const firstMarkdownHeader = rawAssistantText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+/.test(line));

  if (firstMarkdownHeader) {
    return firstMarkdownHeader.replace(/^#{1,6}\s+/, '').trim();
  }

  return undefined;
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
  const firstAssistantMessage = messages.find(
    (message) => message.role === 'assistant' && !message.annotations?.includes('no-store'),
  );
  const firstUserMessage = messages.find((message) => message.role === 'user' && !message.annotations?.includes('no-store'));

  const assistantRawText =
    firstAssistantMessage && typeof firstAssistantMessage.content === 'string' ? firstAssistantMessage.content : '';
  const assistantHeader = extractAssistantHeader(assistantRawText);
  const assistantText = firstAssistantMessage ? extractMessageText(firstAssistantMessage) : '';
  const userText = firstUserMessage ? extractMessageText(firstUserMessage) : '';
  const rawText = assistantHeader || assistantText || userText || fallbackTitle;

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

  const withoutTopicPrefix = cleaned.replace(/^topic\s*:\s*/i, '').replace(/^#+\s*/, '').trim();

  if (!withoutTopicPrefix) {
    return fallbackTitle;
  }

  return truncateTitle(withoutTopicPrefix);
}
