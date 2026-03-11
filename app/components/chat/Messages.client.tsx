import type { Message } from 'ai';
import { Fragment, useMemo, useState } from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { useLocation } from '@remix-run/react';
import { db, chatId } from '~/lib/persistence/useChatHistory';
import { forkChat } from '~/lib/persistence/db';
import { toast } from 'react-toastify';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import type { ProviderInfo } from '~/types/model';
import { useStore } from '@nanostores/react';
import { isDebugMode } from '~/lib/stores/settings';
import { DebugLogPanel } from './DebugLogPanel';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [] } = props;
    const location = useLocation();
    const debugEnabled = useStore(isDebugMode);
    const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);

    const handleRewind = (messageId: string) => {
      const searchParams = new URLSearchParams(location.search);
      searchParams.set('rewindTo', messageId);
      window.location.search = searchParams.toString();
    };

    const handleFork = async (messageId: string) => {
      try {
        if (!db || !chatId.get()) {
          toast.error('Chat persistence is not available');
          return;
        }

        const urlId = await forkChat(db, chatId.get()!, messageId);
        window.location.href = `/chat/${urlId}`;
      } catch (error) {
        toast.error('Failed to fork chat: ' + (error as Error).message);
      }
    };

    return (
      <div id={id} className={props.className} ref={ref}>
        {messages.length > 0
          ? messages.map((message, index) => {
              const { role, content, id: messageId, annotations, parts } = message;
              const isUserMessage = role === 'user';
              const isFirst = index === 0;
              const isHidden = annotations?.includes('hidden');

              if (isHidden) {
                return <Fragment key={index} />;
              }

              return (
                <div
                  key={index}
                  className={classNames('flex gap-4 py-3 w-full rounded-lg', {
                    'mt-4': !isFirst,
                  })}
                >
                  <div className="grid grid-col-1 w-full">
                    {isUserMessage ? (
                      <UserMessage content={content} parts={parts} />
                    ) : (
                      <AssistantMessage
                        content={content}
                        annotations={message.annotations}
                        messageId={messageId}
                        onRewind={handleRewind}
                        onFork={handleFork}
                        append={props.append}
                        chatMode={props.chatMode}
                        setChatMode={props.setChatMode}
                        model={props.model}
                        provider={props.provider}
                        parts={parts}
                        addToolResult={props.addToolResult}
                      />
                    )}
                  </div>
                </div>
              );
            })
          : null}
        {isStreaming && (
          <div className="mt-4 w-full rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="text-bolt-elements-item-contentAccent i-svg-spinners:3-dots-fade text-3xl" />
                <span className="text-xs text-bolt-elements-textSecondary">LLM is processing request</span>
              </div>
              {debugEnabled && (
                <button
                  type="button"
                  onClick={() => setIsDebugPanelOpen((value) => !value)}
                  className="text-xs px-2 py-1 rounded border border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:border-bolt-elements-borderColorActive"
                  aria-expanded={isDebugPanelOpen}
                  aria-controls="stream-debug-panel"
                >
                  {isDebugPanelOpen ? 'Hide debug panel' : 'Show debug panel'}
                </button>
              )}
            </div>

            {debugEnabled && isDebugPanelOpen && <DebugLogPanel panelId="stream-debug-panel" />}
          </div>
        )}
      </div>
    );
  },
);
