import 'ai';

declare module 'ai' {
  export type Message = UIMessage;
  export type LanguageModelV1 = LanguageModel;
  export type CoreTool<T = any, U = any> = Tool<T, U>;

  export type DataStreamWriter = {
    write: (part: any) => void;
    writeData: (data: any) => void;
    writeMessageAnnotation: (annotation: any) => void;
  };

  export function convertToCoreMessages(messages: any[]): any[];
  export function formatDataStreamPart(type: string, data: any): any;
  export function createDataStream(options: {
    execute: (dataStream: DataStreamWriter) => Promise<void> | void;
    onError?: (error: unknown) => string | void;
  }): ReadableStream<any>;
  export function experimental_createMCPClient(options: any): Promise<any>;
}
