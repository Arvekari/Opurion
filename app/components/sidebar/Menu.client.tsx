import { Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { setThemeMode, themeModeStore } from '~/lib/stores/theme';
import { db, deleteById, getAll, chatId, type ChatHistoryItem, useChatHistory } from '~/lib/persistence';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import { ProjectsWorkspacePanel } from './ProjectsWorkspacePanel';
import { ArtifactsMarketplacePanel } from './ArtifactsMarketplacePanel';

interface MenuProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: (tab?: 'profile' | 'settings') => void;
}

function getMessageFingerprint(message?: ChatHistoryItem['messages'][number]): string {
  if (!message) {
    return '';
  }

  const content = typeof message.content === 'string' ? message.content : '';
  const parts = Array.isArray(message.parts)
    ? message.parts
        .map((part) => {
          if (part.type === 'text') {
            return part.text ?? '';
          }

          if (part.type === 'file') {
            return part.filename ?? '';
          }

          return '';
        })
        .join(' ')
    : '';

  const normalizedContent = (content || parts).replace(/\s+/g, ' ').trim().toLowerCase();

  return `${message.role}:${normalizedContent.slice(0, 180)}`;
}

function choosePreferredHistoryItem(current: ChatHistoryItem | undefined, candidate: ChatHistoryItem): ChatHistoryItem {
  if (!current) {
    return candidate;
  }

  const currentTime = Date.parse(current.timestamp || '');
  const candidateTime = Date.parse(candidate.timestamp || '');
  const hasValidCandidateTime = Number.isFinite(candidateTime);
  const hasValidCurrentTime = Number.isFinite(currentTime);

  if (hasValidCandidateTime && (!hasValidCurrentTime || candidateTime > currentTime)) {
    return candidate;
  }

  if ((candidate.messages?.length || 0) > (current.messages?.length || 0)) {
    return candidate;
  }

  return current;
}

function buildHistorySignature(item: ChatHistoryItem): string {
  const firstMessage = item.messages?.[0];
  const lastMessage = item.messages?.[item.messages.length - 1];
  const messageCount = item.messages?.length || 0;
  const description = (item.description || '').trim().toLowerCase();
  const firstFingerprint = getMessageFingerprint(firstMessage);
  const lastFingerprint = getMessageFingerprint(lastMessage);

  return [description, messageCount, firstFingerprint, lastFingerprint].join('::');
}

export function dedupeAccidentalHistoryCopies(items: ChatHistoryItem[]): ChatHistoryItem[] {
  const byIdentity = new Map<string, ChatHistoryItem>();
  const bySignature = new Map<string, ChatHistoryItem>();

  for (const item of items) {
    const identityKey = (item.urlId || item.id || '').trim().toLowerCase();

    if (identityKey) {
      byIdentity.set(identityKey, choosePreferredHistoryItem(byIdentity.get(identityKey), item));
      continue;
    }

    byIdentity.set(`fallback:${byIdentity.size}`, item);
  }

  for (const item of byIdentity.values()) {
    const signature = buildHistorySignature(item);
    bySignature.set(signature, choosePreferredHistoryItem(bySignature.get(signature), item));
  }

  return [...bySignature.values()].sort((left, right) => {
    const rightTime = Date.parse(right.timestamp || '');
    const leftTime = Date.parse(left.timestamp || '');

    if (Number.isFinite(rightTime) && Number.isFinite(leftTime)) {
      return rightTime - leftTime;
    }

    if (Number.isFinite(rightTime)) {
      return 1;
    }

    if (Number.isFinite(leftTime)) {
      return -1;
    }

    return 0;
  });
}

function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

export const Menu = ({ collapsed, onToggle, onOpenSettings }: MenuProps) => {
  const { exportChat, duplicateCurrentChat } = useChatHistory();
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [dialogContent, setDialogContent] = useState<{ type: 'delete'; item: ChatHistoryItem } | null>(null);
  const [activeSection, setActiveSection] = useState<'chats' | 'projects' | 'artifacts' | 'code'>('chats');
  const [loggingOut, setLoggingOut] = useState(false);
  const profile = useStore(profileStore);
  const themeMode = useStore(themeModeStore);

  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ['description'],
  });

  const loadEntries = useCallback(() => {
    if (db) {
      getAll(db)
        .then((items) => items.filter((item) => item.urlId && item.description))
        .then((items) => dedupeAccidentalHistoryCopies(items))
        .then(setList)
        .catch((error) => toast.error(error.message));
    }
  }, []);

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();

      if (!db) return;

      deleteById(db, item.id)
        .then(() => {
          toast.success('Chat deleted');
          loadEntries();

          if (chatId.get() === item.id) {
            window.location.pathname = '/';
          }
        })
        .catch((err) => toast.error(err.message));
    },
    [loadEntries],
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      window.location.href = '/';
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Logout failed');
      setLoggingOut(false);
    }
  }, [loggingOut]);

  // Ordered: Projects / Artifacts / Code — gap — Chats
  const navItems: Array<{
    key: 'projects' | 'artifacts' | 'code' | 'chats';
    label: string;
    icon: string;
    separator?: boolean;
  }> = [
    { key: 'projects', label: 'Projects', icon: '📁' },
    { key: 'artifacts', label: 'Artifacts', icon: '📦' },
    { key: 'code', label: 'Code', icon: '{ }' },
    { key: 'chats', label: 'Chats', icon: '💬', separator: true },
  ];
  return (
    <>
      <div
        style={{
          gridRow: '1 / span 2',
          background: 'var(--bolt-elements-sidebar-background)',
          borderRight: '1px solid var(--bolt-elements-borderColor)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          fontSize: '14px',
          color: 'var(--bolt-elements-textPrimary)',
        }}
      >
        {/* Logo + toggle */}
        <div
          style={{
            display: 'flex',
            flexDirection: collapsed ? 'column' : 'row',
            justifyContent: collapsed ? 'flex-start' : 'space-between',
            alignItems: 'center',
            padding: collapsed ? '10px 6px' : '14px',
            fontWeight: 600,
            borderBottom: '1px solid var(--bolt-elements-borderColor)',
            minHeight: '60px',
            gap: collapsed ? '6px' : '8px',
          }}
        >
          {!collapsed && (
            <img
              src="/logo-opurion-full.png"
              alt="Opurion"
              style={{ height: '30px', width: 'auto', objectFit: 'contain', flex: 1, minWidth: 0 }}
            />
          )}
          {collapsed && (
            <img
              src="/logo-opurion-mark.png"
              alt="Opurion"
              style={{ width: '36px', height: '36px', objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          <button
            onClick={onToggle}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--bolt-elements-textPrimary)',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: 1,
              padding: '2px 4px',
              borderRadius: '4px',
              flexShrink: 0,
            }}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
        </div>

        {/* Nav */}
        <nav
          style={{
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {/* New chat */}
          <a
            href="/"
            style={{
              display: 'block',
              padding: '8px 10px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: 'var(--bolt-elements-textPrimary)',
              background: 'rgba(120,120,120,.12)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textAlign: collapsed ? 'center' : 'left',
            }}
            title="New chat"
          >
            {collapsed ? '✏' : 'New chat'}
          </a>

          {/* Section nav items */}
          {navItems.map(({ key, label, icon, separator }) => (
            <Fragment key={key}>
              {separator && (
                <div
                  style={{ height: '1px', background: 'var(--bolt-elements-borderColor, #2b2b33)', margin: '4px 0' }}
                />
              )}
              <button
                onClick={() => {
                  if (collapsed) onToggle();
                  setActiveSection(key);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: collapsed ? 'center' : 'left',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--bolt-elements-textPrimary)',
                  fontSize: '14px',
                  fontWeight: activeSection === key ? 700 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
                title={label}
              >
                {collapsed ? icon : label}
              </button>
            </Fragment>
          ))}

          {/* Chat history list (only when expanded and Chats active) */}
          {!collapsed && activeSection === 'chats' && (
            <div
              style={{
                marginTop: '8px',
                flex: 1,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <input
                type="search"
                placeholder="Search chats…"
                onChange={handleSearchChange}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--bolt-elements-borderColor)',
                  background: 'var(--bolt-elements-background-depth-2)',
                  color: 'var(--bolt-elements-textPrimary)',
                  fontSize: '13px',
                  marginBottom: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
              <div style={{ flex: 1, overflowY: 'auto', fontSize: '13px' }}>
                {filteredList.length === 0 && (
                  <div style={{ padding: '6px 10px', color: 'var(--bolt-elements-textTertiary)' }}>
                    No conversations
                  </div>
                )}
                <DialogRoot open={dialogContent !== null}>
                  {binDates(filteredList).map(({ category, items }) => (
                    <div key={category}>
                      <div
                        style={{
                          padding: '4px 10px',
                          color: 'var(--bolt-elements-textTertiary)',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '.05em',
                        }}
                      >
                        {category}
                      </div>
                      {items.map((item) => (
                        <HistoryItem
                          key={item.id}
                          item={item}
                          exportChat={exportChat}
                          onDelete={(e) => {
                            e.preventDefault();
                            setDialogContent({ type: 'delete', item });
                          }}
                          onDuplicate={duplicateCurrentChat}
                          selectionMode={false}
                          isSelected={false}
                          onToggleSelection={() => {}}
                        />
                      ))}
                    </div>
                  ))}
                  <Dialog onBackdrop={() => setDialogContent(null)} onClose={() => setDialogContent(null)}>
                    {dialogContent?.type === 'delete' && (
                      <>
                        <div className="p-6 bg-bolt-elements-background-depth-1">
                          <DialogTitle className="text-bolt-elements-textPrimary">Delete Chat?</DialogTitle>
                          <DialogDescription className="mt-2 text-bolt-elements-textSecondary">
                            Delete &quot;{dialogContent.item.description}&quot;?
                          </DialogDescription>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor">
                          <DialogButton type="secondary" onClick={() => setDialogContent(null)}>
                            Cancel
                          </DialogButton>
                          <DialogButton
                            type="danger"
                            onClick={(e) => {
                              deleteItem(e, dialogContent.item);
                              setDialogContent(null);
                            }}
                          >
                            Delete
                          </DialogButton>
                        </div>
                      </>
                    )}
                  </Dialog>
                </DialogRoot>
              </div>
            </div>
          )}

          {/* Project / Artifact / Code stub panels */}
          {!collapsed && activeSection !== 'chats' && (
            <div style={{ marginTop: '8px', overflowY: 'auto', maxHeight: '100%' }}>
              {activeSection === 'projects' && <ProjectsWorkspacePanel />}
              {activeSection === 'artifacts' && <ArtifactsMarketplacePanel />}
              {activeSection === 'code' && (
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
                  Code section will show project code context and shared assets here.
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Footer: theme + settings + profile */}
        <div
          style={{
            padding: '12px',
            borderTop: '1px solid var(--bolt-elements-borderColor)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: collapsed ? 'center' : 'stretch',
            gap: '8px',
          }}
        >
          {/* Theme slider — horizontal when expanded, vertical when collapsed */}
          {!collapsed ? (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title={themeMode === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              <span style={{ fontSize: '13px' }}>☀️</span>
              <label style={{ position: 'relative', width: '36px', height: '20px', cursor: 'pointer', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={themeMode === 'dark'}
                  onChange={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
                  style={{ display: 'none' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: themeMode === 'dark' ? '#5a5a7a' : '#888',
                    borderRadius: '20px',
                    transition: '.2s',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: themeMode === 'dark' ? '18px' : '2px',
                    width: '16px',
                    height: '16px',
                    background: 'white',
                    borderRadius: '50%',
                    transition: '.2s',
                  }}
                />
              </label>
              <span style={{ fontSize: '13px' }}>🌙</span>
            </div>
          ) : (
            // Vertical slider when collapsed
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
              title={themeMode === 'dark' ? 'Switch to light' : 'Switch to dark'}
            >
              <span style={{ fontSize: '11px' }}>☀️</span>
              <label style={{ position: 'relative', width: '20px', height: '36px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={themeMode === 'dark'}
                  onChange={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
                  style={{ display: 'none' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: themeMode === 'dark' ? '#5a5a7a' : '#888',
                    borderRadius: '20px',
                    transition: '.2s',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: '2px',
                    top: themeMode === 'dark' ? '18px' : '2px',
                    width: '16px',
                    height: '16px',
                    background: 'white',
                    borderRadius: '50%',
                    transition: '.2s',
                  }}
                />
              </label>
              <span style={{ fontSize: '11px' }}>🌙</span>
            </div>
          )}

          {/* Settings */}
          <button
            onClick={() => onOpenSettings('settings')}
            title="Settings"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--bolt-elements-textPrimary)',
              textAlign: collapsed ? 'center' : 'left',
              padding: '4px 0',
              fontSize: '13px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              width: '100%',
            }}
          >
            {collapsed ? '⚙' : '⚙ Settings'}
          </button>

          <button
            onClick={() => void handleLogout()}
            title="Log out"
            disabled={loggingOut}
            style={{
              background: 'var(--bolt-elements-background-depth-2)',
              border: '1px solid var(--bolt-elements-borderColor)',
              borderRadius: '8px',
              cursor: loggingOut ? 'default' : 'pointer',
              color: 'var(--bolt-elements-textPrimary)',
              textAlign: collapsed ? 'center' : 'left',
              padding: collapsed ? '6px 0' : '6px 10px',
              fontSize: '13px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              width: '100%',
              opacity: loggingOut ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? '0' : '8px',
            }}
          >
            <span className="i-ph:sign-out text-[14px]" aria-hidden="true" />
            {!collapsed && (loggingOut ? 'Logging out…' : 'Log out')}
          </button>

          {/* Profile */}
          {!collapsed && (
            <button
              onClick={() => onOpenSettings('profile')}
              title="Go to profile settings"
              style={{
                color: 'var(--bolt-elements-textSecondary)',
                fontSize: '13px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                padding: '0',
                fontWeight: 500,
              }}
            >
              {profile?.name || profile?.username || 'user'}
            </button>
          )}

          {collapsed && (
            <button
              onClick={() => onOpenSettings('profile')}
              title={`${profile?.name || profile?.username || 'User'} - Go to profile settings`}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(120,120,120,.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--bolt-elements-textPrimary)',
                marginTop: '2px',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {getInitials(profile?.name || profile?.username)}
            </button>
          )}
        </div>
      </div>
    </>
  );
};
