import { useMemo } from 'react';
import type { ChatHistoryItem } from '~/lib/persistence';

type GalleryEntry = {
  id: string;
  chatId: string;
  chatName: string;
  chatTimestamp: string;
  role: 'user' | 'assistant';
  source: 'part' | 'markdown';
  mimeType?: string;
  url: string;
  label: string;
};

function isLikelyImageMime(mimeType?: string): boolean {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/');
}

function buildDataUrl(data: string, mimeType?: string): string {
  if (data.startsWith('data:')) {
    return data;
  }

  const safeMime = mimeType || 'image/png';
  return `data:${safeMime};base64,${data}`;
}

function extractMarkdownImageUrls(content: string): string[] {
  const urls: string[] = [];

  const markdownImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = markdownImageRegex.exec(content)) !== null) {
    const url = (match[1] || '').trim();

    if (url) {
      urls.push(url);
    }
  }

  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  while ((match = htmlImageRegex.exec(content)) !== null) {
    const url = (match[1] || '').trim();

    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

function extractImageEntries(chats: ChatHistoryItem[]): GalleryEntry[] {
  const entries: GalleryEntry[] = [];

  chats.forEach((chat) => {
    const chatName = (chat.description || chat.urlId || 'Untitled chat').trim();

    (chat.messages || []).forEach((message, messageIndex) => {
      const role = message.role === 'assistant' ? 'assistant' : 'user';
      const parts = Array.isArray((message as any).parts) ? ((message as any).parts as Array<any>) : [];

      parts.forEach((part, partIndex) => {
        if (part?.type !== 'file') {
          return;
        }

        const mimeType = typeof part.mimeType === 'string' ? part.mimeType : undefined;
        const candidateUrl =
          typeof part.url === 'string'
            ? part.url
            : typeof part.data === 'string'
              ? buildDataUrl(part.data, mimeType)
              : undefined;

        if (!candidateUrl) {
          return;
        }

        if (!isLikelyImageMime(mimeType) && !candidateUrl.startsWith('data:image/')) {
          return;
        }

        entries.push({
          id: `${chat.id}-m${messageIndex}-p${partIndex}`,
          chatId: chat.id,
          chatName,
          chatTimestamp: chat.timestamp,
          role,
          source: 'part',
          mimeType,
          url: candidateUrl,
          label: part.filename || `${role} image ${partIndex + 1}`,
        });
      });

      const content = typeof message.content === 'string' ? message.content : '';

      if (!content) {
        return;
      }

      extractMarkdownImageUrls(content).forEach((url, imageIndex) => {
        const lowerUrl = url.toLowerCase();
        const looksLikeImage =
          lowerUrl.startsWith('data:image/') ||
          /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|$)/i.test(lowerUrl) ||
          lowerUrl.includes('/image');

        if (!looksLikeImage) {
          return;
        }

        entries.push({
          id: `${chat.id}-m${messageIndex}-md${imageIndex}`,
          chatId: chat.id,
          chatName,
          chatTimestamp: chat.timestamp,
          role,
          source: 'markdown',
          url,
          label: `${role} image ${imageIndex + 1}`,
        });
      });
    });
  });

  return entries.sort((left, right) => Date.parse(right.chatTimestamp || '') - Date.parse(left.chatTimestamp || ''));
}

interface MaterialGalleryPanelProps {
  chats: ChatHistoryItem[];
  activeChatId?: string;
}

export function MaterialGalleryPanel({ chats, activeChatId }: MaterialGalleryPanelProps) {
  const entries = useMemo(() => extractImageEntries(chats), [chats]);

  const grouped = useMemo(() => {
    const map = new Map<string, { chatName: string; chatId: string; entries: GalleryEntry[] }>();

    for (const entry of entries) {
      if (!map.has(entry.chatId)) {
        map.set(entry.chatId, { chatName: entry.chatName, chatId: entry.chatId, entries: [] });
      }

      map.get(entry.chatId)!.entries.push(entry);
    }

    return Array.from(map.values());
  }, [entries]);

  if (grouped.length === 0) {
    return (
      <div
        style={{
          padding: '10px',
          borderRadius: '8px',
          border: '1px solid var(--bolt-elements-borderColor)',
          background: 'var(--bolt-elements-background-depth-2)',
          color: 'var(--bolt-elements-textTertiary)',
          fontSize: '13px',
        }}
      >
        No uploaded or generated images yet for saved chats.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {grouped.map((chatGroup) => {
        const isActive = activeChatId === chatGroup.chatId;

        return (
          <div
            key={chatGroup.chatId}
            style={{
              border: '1px solid var(--bolt-elements-borderColor)',
              borderRadius: '10px',
              padding: '8px',
              background: isActive
                ? 'var(--bolt-elements-background-depth-3)'
                : 'var(--bolt-elements-background-depth-2)',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--bolt-elements-textPrimary)',
                marginBottom: '8px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={chatGroup.chatName}
            >
              {chatGroup.chatName} ({chatGroup.entries.length})
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
              {chatGroup.entries.slice(0, 40).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: '1px solid var(--bolt-elements-borderColor)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'var(--bolt-elements-background-depth-1)',
                  }}
                >
                  <a href={entry.url} target="_blank" rel="noreferrer" title={entry.label}>
                    <img
                      src={entry.url}
                      alt={entry.label}
                      loading="lazy"
                      style={{ width: '100%', height: '84px', objectFit: 'cover', display: 'block' }}
                    />
                  </a>
                  <div style={{ padding: '6px', fontSize: '11px', color: 'var(--bolt-elements-textSecondary)' }}>
                    <div
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginBottom: '4px',
                      }}
                      title={entry.label}
                    >
                      {entry.role} • {entry.label}
                    </div>
                    <a
                      href={entry.url}
                      download
                      style={{ color: 'var(--bolt-elements-textPrimary)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
