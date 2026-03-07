import { formatDataStreamPart } from '@ai-sdk/ui-utils';

export interface DataStreamWriter {
  write(chunk: string): void;
  writeData(value: unknown): void;
  writeMessageAnnotation(value: unknown): void;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function normalizeUsage(usage: any): { promptTokens: number; completionTokens: number } | undefined {
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  const promptTokens = usage.promptTokens ?? usage.inputTokens;
  const completionTokens = usage.completionTokens ?? usage.outputTokens;

  if (typeof promptTokens !== 'number' || typeof completionTokens !== 'number') {
    return undefined;
  }

  return { promptTokens, completionTokens };
}

export function writeStreamPartToDataStream(part: any, dataStream: DataStreamWriter): void {
  switch (part?.type) {
    case 'text-delta':
      dataStream.write(formatDataStreamPart('text', part.text));
      return;
    case 'reasoning-delta':
      dataStream.write(formatDataStreamPart('reasoning', part.text));
      return;
    case 'source':
      dataStream.write(formatDataStreamPart('source', part));
      return;
    case 'tool-input-start':
      dataStream.write(
        formatDataStreamPart('tool_call_streaming_start', {
          toolCallId: part.id,
          toolName: part.toolName,
        }),
      );
      return;
    case 'tool-input-delta':
      dataStream.write(
        formatDataStreamPart('tool_call_delta', {
          toolCallId: part.id,
          argsTextDelta: part.delta,
        }),
      );
      return;
    case 'tool-call':
      dataStream.write(
        formatDataStreamPart('tool_call', {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: part.input ?? {},
        }),
      );
      return;
    case 'tool-result':
      dataStream.write(
        formatDataStreamPart('tool_result', {
          toolCallId: part.toolCallId,
          result: part.output,
        }),
      );
      return;
    case 'finish-step':
      dataStream.write(
        formatDataStreamPart('finish_step', {
          finishReason: part.finishReason ?? 'unknown',
          usage: normalizeUsage(part.usage),
          isContinued: false,
        }),
      );
      return;
    case 'finish':
      dataStream.write(
        formatDataStreamPart('finish_message', {
          finishReason: part.finishReason ?? 'unknown',
          usage: normalizeUsage(part.totalUsage),
        }),
      );
      return;
    case 'error':
      dataStream.write(formatDataStreamPart('error', getErrorMessage(part.error)));
      return;
    default:
      return;
  }
}

export function createDataStream({
  execute,
  onError,
}: {
  execute: (dataStream: DataStreamWriter) => Promise<void> | void;
  onError?: (error: unknown) => string;
}): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      let closed = false;

      const closeOnce = () => {
        if (closed) {
          return;
        }

        closed = true;
        controller.close();
      };

      const writeSafe = (chunk: string) => {
        if (closed) {
          return;
        }

        controller.enqueue(chunk);
      };

      const dataStream: DataStreamWriter = {
        write(chunk) {
          writeSafe(chunk);
        },
        writeData(value) {
          writeSafe(formatDataStreamPart('data', [value as any]));
        },
        writeMessageAnnotation(value) {
          writeSafe(formatDataStreamPart('message_annotations', [value as any]));
        },
      };

      Promise.resolve(execute(dataStream))
        .catch((error) => {
          const errorMessage = onError ? onError(error) : getErrorMessage(error);
          dataStream.write(formatDataStreamPart('error', errorMessage));
        })
        .finally(() => {
          closeOnce();
        });
    },
  });
}
