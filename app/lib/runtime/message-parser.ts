import type { ActionType, BoltAction, BoltActionData, FileAction, ShellAction, SupabaseAction } from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<boltAction';
const ARTIFACT_ACTION_TAG_CLOSE = '</boltAction>';
const ARTIFACT_TAG_OPEN_ESCAPED = '&lt;boltArtifact';
const ARTIFACT_TAG_CLOSE_ESCAPED = '&lt;/boltArtifact&gt;';
const ARTIFACT_ACTION_TAG_OPEN_ESCAPED = '&lt;boltAction';
const ARTIFACT_ACTION_TAG_CLOSE_ESCAPED = '&lt;/boltAction&gt;';
const TAG_END_ESCAPED = '&gt;';
const BOLT_QUICK_ACTIONS_OPEN = '<bolt-quick-actions>';
const BOLT_QUICK_ACTIONS_CLOSE = '</bolt-quick-actions>';

const logger = createScopedLogger('MessageParser');

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
  artifactId?: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionStream?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
  artifactId?: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
}

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  artifactCounter: number;
  currentArtifact?: BoltArtifactData;
  currentAction: BoltActionData;
  actionId: number;
}

function cleanoutMarkdownSyntax(content: string) {
  const codeBlockRegex = /^\s*```\w*\n([\s\S]*?)\n\s*```\s*$/;
  const match = content.match(codeBlockRegex);

  // console.log('matching', !!match, content);

  if (match) {
    return match[1]; // Remove common leading 4-space indent
  } else {
    return content;
  }
}

function cleanEscapedTags(content: string) {
  return content.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Strip XML CDATA wrappers that LLMs sometimes emit around file content.
 * e.g. `<![CDATA[{"name":"app"}]]>` → `{"name":"app"}`
 */
function stripCDATAWrapper(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith('<![CDATA[')) {
    const inner = trimmed.slice('<![CDATA['.length);
    return inner.endsWith(']]>') ? inner.slice(0, -3) : inner;
  }

  return content;
}

function pickEarliestIndex(
  ...candidates: Array<{
    index: number;
    length: number;
    escaped: boolean;
  }>
) {
  const valid = candidates.filter((candidate) => candidate.index !== -1);

  if (valid.length === 0) {
    return undefined;
  }

  return valid.reduce((earliest, current) => (current.index < earliest.index ? current : earliest));
}

function decodeEscapedTag(tag: string) {
  return tag.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  #artifactCounter = 0;

  constructor(private _options: StreamingMessageParserOptions = {}) {}

  parse(messageId: string, input: string) {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideAction: false,
        insideArtifact: false,
        artifactCounter: 0,
        currentAction: { content: '' },
        actionId: 0,
      };

      this.#messages.set(messageId, state);
    }

    let output = '';
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      if (input.startsWith(BOLT_QUICK_ACTIONS_OPEN, i)) {
        const actionsBlockEnd = input.indexOf(BOLT_QUICK_ACTIONS_CLOSE, i);

        if (actionsBlockEnd !== -1) {
          const actionsBlockContent = input.slice(i + BOLT_QUICK_ACTIONS_OPEN.length, actionsBlockEnd);

          // Find all <bolt-quick-action ...>label</bolt-quick-action> inside
          const quickActionRegex = /<bolt-quick-action([^>]*)>([\s\S]*?)<\/bolt-quick-action>/g;
          let match;
          const buttons = [];

          while ((match = quickActionRegex.exec(actionsBlockContent)) !== null) {
            const tagAttrs = match[1];
            const label = match[2];
            const type = this.#extractAttribute(tagAttrs, 'type');
            const message = this.#extractAttribute(tagAttrs, 'message');
            const path = this.#extractAttribute(tagAttrs, 'path');
            const href = this.#extractAttribute(tagAttrs, 'href');
            buttons.push(
              createQuickActionElement(
                { type: type || '', message: message || '', path: path || '', href: href || '' },
                label,
              ),
            );
          }
          output += createQuickActionGroup(buttons);
          i = actionsBlockEnd + BOLT_QUICK_ACTIONS_CLOSE.length;
          continue;
        }
      }

      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        if (currentArtifact === undefined) {
          unreachable('Artifact not initialized');
        }

        if (state.insideAction) {
          const closeMatch = pickEarliestIndex(
            {
              index: input.indexOf(ARTIFACT_ACTION_TAG_CLOSE, i),
              length: ARTIFACT_ACTION_TAG_CLOSE.length,
              escaped: false,
            },
            {
              index: input.indexOf(ARTIFACT_ACTION_TAG_CLOSE_ESCAPED, i),
              length: ARTIFACT_ACTION_TAG_CLOSE_ESCAPED.length,
              escaped: true,
            },
          );

          const currentAction = state.currentAction;

          if (closeMatch) {
            currentAction.content += input.slice(i, closeMatch.index);

            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              // Remove markdown code block syntax if present and file is not markdown
              if (!currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
                content = cleanEscapedTags(content);
                content = stripCDATAWrapper(content);
              }

              content += '\n';
            }

            currentAction.content = content;

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,

              /**
               * We decrement the id because it's been incremented already
               * when `onActionOpen` was emitted to make sure the ids are
               * the same.
               */
              actionId: String(state.actionId - 1),

              action: currentAction as BoltAction,
            });

            state.insideAction = false;
            state.currentAction = { content: '' };

            i = closeMatch.index + closeMatch.length;
          } else {
            if ('type' in currentAction && currentAction.type === 'file') {
              let content = input.slice(i);

              if (!currentAction.filePath.endsWith('.md')) {
                content = cleanoutMarkdownSyntax(content);
                content = cleanEscapedTags(content);
                content = stripCDATAWrapper(content);
              }

              this._options.callbacks?.onActionStream?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId - 1),
                action: {
                  ...(currentAction as FileAction),
                  content,
                  filePath: currentAction.filePath,
                },
              });
            }

            break;
          }
        } else {
          const actionOpenMatch = pickEarliestIndex(
            {
              index: input.indexOf(ARTIFACT_ACTION_TAG_OPEN, i),
              length: ARTIFACT_ACTION_TAG_OPEN.length,
              escaped: false,
            },
            {
              index: input.indexOf(ARTIFACT_ACTION_TAG_OPEN_ESCAPED, i),
              length: ARTIFACT_ACTION_TAG_OPEN_ESCAPED.length,
              escaped: true,
            },
          );
          const artifactCloseMatch = pickEarliestIndex(
            {
              index: input.indexOf(ARTIFACT_TAG_CLOSE, i),
              length: ARTIFACT_TAG_CLOSE.length,
              escaped: false,
            },
            {
              index: input.indexOf(ARTIFACT_TAG_CLOSE_ESCAPED, i),
              length: ARTIFACT_TAG_CLOSE_ESCAPED.length,
              escaped: true,
            },
          );

          if (
            actionOpenMatch &&
            (!artifactCloseMatch || actionOpenMatch.index < artifactCloseMatch.index)
          ) {
            const actionEndIndex = actionOpenMatch.escaped
              ? input.indexOf(TAG_END_ESCAPED, actionOpenMatch.index)
              : input.indexOf('>', actionOpenMatch.index);

            if (actionEndIndex !== -1) {
              state.insideAction = true;

              const rawActionTag = input.slice(
                actionOpenMatch.index,
                actionEndIndex + (actionOpenMatch.escaped ? TAG_END_ESCAPED.length : 1),
              );

              state.currentAction = this.#parseActionTag(actionOpenMatch.escaped ? decodeEscapedTag(rawActionTag) : rawActionTag);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as BoltAction,
              });

              i = actionEndIndex + (actionOpenMatch.escaped ? TAG_END_ESCAPED.length : 1);
            } else {
              break;
            }
          } else if (artifactCloseMatch) {
            this._options.callbacks?.onArtifactClose?.({
              messageId,
              artifactId: currentArtifact.id,
              ...currentArtifact,
            });

            state.insideArtifact = false;
            state.currentArtifact = undefined;

            i = artifactCloseMatch.index + artifactCloseMatch.length;
          } else {
            break;
          }
        }
      } else if (input.startsWith(ARTIFACT_TAG_OPEN_ESCAPED, i)) {
        const openTagEnd = input.indexOf(TAG_END_ESCAPED, i);

        if (openTagEnd === -1) {
          break;
        }

        const escapedArtifactTag = input.slice(i, openTagEnd + TAG_END_ESCAPED.length);
        const artifactTag = decodeEscapedTag(escapedArtifactTag);
        const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
        const type = this.#extractAttribute(artifactTag, 'type') as string;
        const artifactId = `${messageId}-${state.artifactCounter++}`;

        if (!artifactTitle) {
          logger.warn('Artifact title missing');
        }

        state.insideArtifact = true;

        const currentArtifact = {
          id: artifactId,
          title: artifactTitle,
          type,
        } satisfies BoltArtifactData;

        state.currentArtifact = currentArtifact;

        this._options.callbacks?.onArtifactOpen?.({
          messageId,
          artifactId: currentArtifact.id,
          ...currentArtifact,
        });

        const artifactFactory = this._options.artifactElement ?? createArtifactElement;

        output += artifactFactory({ messageId, artifactId });
        i = openTagEnd + TAG_END_ESCAPED.length;
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        let j = i;
        let potentialTag = '';

        while (j < input.length && potentialTag.length < ARTIFACT_TAG_OPEN.length) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            if (nextChar && nextChar !== '>' && nextChar !== ' ') {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf('>', j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);

              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const type = this.#extractAttribute(artifactTag, 'type') as string;

              // const artifactId = this.#extractAttribute(artifactTag, 'id') as string;
              const artifactId = `${messageId}-${state.artifactCounter++}`;

              if (!artifactTitle) {
                logger.warn('Artifact title missing');
              }

              if (!artifactId) {
                logger.warn('Artifact id missing');
              }

              state.insideArtifact = true;

              const currentArtifact = {
                id: artifactId,
                title: artifactTitle,
                type,
              } satisfies BoltArtifactData;

              state.currentArtifact = currentArtifact;

              this._options.callbacks?.onArtifactOpen?.({
                messageId,
                artifactId: currentArtifact.id,
                ...currentArtifact,
              });

              const artifactFactory = this._options.artifactElement ?? createArtifactElement;

              output += artifactFactory({ messageId, artifactId });

              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }

            break;
          } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            output += input.slice(i, j + 1);
            i = j + 1;
            break;
          }

          j++;
        }

        if (j === input.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
          break;
        }
      } else {
        /*
         * Note: Auto-file-creation from code blocks is now handled by EnhancedMessageParser
         * to avoid duplicate processing and provide better shell command detection
         */
        output += input[i];
        i++;
      }

      if (earlyBreak) {
        break;
      }
    }

    state.position = i;

    return output;
  }

  reset() {
    this.#messages.clear();
  }

  #parseActionTag(actionTag: string) {
    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'supabase') {
      const operation = this.#extractAttribute(actionTag, 'operation');

      if (!operation || !['migration', 'query'].includes(operation)) {
        logger.warn(`Invalid or missing operation for Supabase action: ${operation}`);
        throw new Error(`Invalid Supabase operation: ${operation}`);
      }

      (actionAttributes as SupabaseAction).operation = operation as 'migration' | 'query';

      if (operation === 'migration') {
        const filePath = this.#extractAttribute(actionTag, 'filePath');

        if (!filePath) {
          logger.warn('Migration requires a filePath');
          throw new Error('Migration requires a filePath');
        }

        (actionAttributes as SupabaseAction).filePath = filePath;
      }
    } else if (actionType === 'file') {
      const filePath = this.#extractAttribute(actionTag, 'filePath') as string;

      if (!filePath) {
        logger.debug('File path not specified');
      }

      (actionAttributes as FileAction).filePath = filePath;
    } else if (!['shell', 'start'].includes(actionType)) {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as FileAction | ShellAction;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    const match = tag.match(new RegExp(`${attributeName}="([^"]*)"`, 'i'));
    return match ? match[1] : undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__boltArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function createQuickActionElement(props: Record<string, string>, label: string) {
  const elementProps = [
    'class="__boltQuickAction__"',
    'data-bolt-quick-action="true"',
    ...Object.entries(props).map(([key, value]) => `data-${camelToDashCase(key)}=${JSON.stringify(value)}`),
  ];

  return `<button ${elementProps.join(' ')}>${label}</button>`;
}

function createQuickActionGroup(buttons: string[]) {
  return `<div class=\"__boltQuickAction__\" data-bolt-quick-action=\"true\">${buttons.join('')}</div>`;
}
