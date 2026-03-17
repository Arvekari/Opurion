import type { Message } from 'ai';
import { Fragment } from 'react';
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

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  streamingState?: 'submitted' | 'streaming' | 'stalled';
  messages?: Message[];
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  onEditQueuedMessage?: (queuedMessageId: string) => void;
  onRemoveQueuedMessage?: (queuedMessageId: string) => void;
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [], streamingState = 'streaming' } = props;
    const location = useLocation();
    const loadingLabel =
      streamingState === 'submitted'
        ? 'Request sent. Waiting for the first model response.'
        : streamingState === 'stalled'
          ? 'The response looks stalled.'
          : 'Model is working on the request';

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
              const isQueued = annotations?.includes('queued');

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
                    {isUserMessage && isQueued && (
                      <div className="mb-2 flex items-center justify-end gap-2">
                        <span className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-bolt-elements-textSecondary">
                          Queued
                        </span>
                        <button
                          type="button"
                          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-[11px] text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                          onClick={() => props.onEditQueuedMessage?.(String(messageId))}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-[11px] text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                          onClick={() => props.onRemoveQueuedMessage?.(String(messageId))}
                        >
                          Remove
                        </button>
                      </div>
                    )}
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
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="text-bolt-elements-item-contentAccent i-svg-spinners:3-dots-fade text-3xl" />
                <span className="text-xs text-bolt-elements-textSecondary">{loadingLabel}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
