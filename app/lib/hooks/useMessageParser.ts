import type { Message } from 'ai';
import { useCallback, useRef, useState } from 'react';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import { stripExecutableMarkup } from '~/lib/chat/executableMarkup';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');
const extractTextContent = (message: Message): string => {
  if (Array.isArray(message.content)) {
    return (message.content.find((item: any) => item.type === 'text')?.text as string) || '';
  }

  if (message.content) {
    return message.content;
  }

  // v3 UIMessage: text lives in parts, not content
  const parts = (message as any).parts;

  if (Array.isArray(parts)) {
    return parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text ?? '')
      .join('');
  }

  return '';
};

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});
  const chatModeRef = useRef<'discuss' | 'build'>('build');
  const messageParserRef = useRef<EnhancedStreamingMessageParser>();

  if (!messageParserRef.current) {
    messageParserRef.current = new EnhancedStreamingMessageParser({
      callbacks: {
        onArtifactOpen: (data) => {
          if (chatModeRef.current === 'discuss') {
            return;
          }

          logger.trace('onArtifactOpen', data);
          workbenchStore.showWorkbench.set(true);
          workbenchStore.addArtifact(data);
        },
        onArtifactClose: (data) => {
          if (chatModeRef.current === 'discuss') {
            return;
          }

          logger.trace('onArtifactClose');
          workbenchStore.updateArtifact(data, { closed: true });
        },
        onActionOpen: (data) => {
          if (chatModeRef.current === 'discuss') {
            return;
          }

          logger.trace('onActionOpen', data.action);

          if (data.action.type === 'file') {
            workbenchStore.addAction(data);
          }
        },
        onActionClose: (data) => {
          if (chatModeRef.current === 'discuss') {
            return;
          }

          logger.trace('onActionClose', data.action);

          if (data.action.type !== 'file') {
            workbenchStore.addAction(data);
          }

          workbenchStore.runAction(data);
        },
        onActionStream: (data) => {
          if (chatModeRef.current === 'discuss') {
            return;
          }

          logger.trace('onActionStream', data.action);
          workbenchStore.runAction(data, true);
        },
      },
    });
  }

  const parseMessages = useCallback((messages: Message[], isLoading: boolean, chatMode: 'discuss' | 'build') => {
    chatModeRef.current = chatMode;
    let reset = false;
    const messageParser = messageParserRef.current!;

    if (import.meta.env.DEV && !isLoading) {
      reset = true;
      messageParser.reset();
    }

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant' || message.role === 'user') {
        const rawContent = extractTextContent(message);
        const parseableContent = chatMode === 'discuss' ? stripExecutableMarkup(rawContent) : rawContent;
        const newParsedContent = messageParser.parse(message.id, parseableContent);
        setParsedMessages((prevParsed) => ({
          ...prevParsed,
          [index]: !reset ? (prevParsed[index] || '') + newParsedContent : newParsedContent,
        }));
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
