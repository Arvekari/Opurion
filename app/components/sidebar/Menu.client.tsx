import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { setThemeMode, themeModeStore } from '~/lib/stores/theme';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import { SettingsButton, HelpButton } from '~/components/ui/SettingsButton';
import { Button } from '~/components/ui/Button';
import { db, deleteById, getAll, chatId, type ChatHistoryItem, useChatHistory } from '~/lib/persistence';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import { CollabPanel } from './CollabPanel';

type DialogContent =
  | { type: 'delete'; item: ChatHistoryItem }
  | { type: 'bulkDelete'; items: ChatHistoryItem[] }
  | null;

function CurrentDateTime() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-bolt-elements-textSecondary border-b border-bolt-elements-borderColor">
      <div className="h-4 w-4 i-ph:clock opacity-80" />
      <div className="flex gap-2">
        <span>{dateTime.toLocaleDateString()}</span>
        <span>{dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

function getInitials(name?: string): string {
  if (!name) {
    return 'G';
  }

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export const Menu = () => {
  const { duplicateCurrentChat, exportChat } = useChatHistory();
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const profile = useStore(profileStore);
  const themeMode = useStore(themeModeStore);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<'chats' | 'projects' | 'artifacts' | 'code'>('chats');

  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ['description'],
  });

  const loadEntries = useCallback(() => {
    if (db) {
      getAll(db)
        .then((list) => list.filter((item) => item.urlId && item.description))
        .then(setList)
        .catch((error) => toast.error(error.message));
    }
  }, []);

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      if (!db) {
        throw new Error('Database not available');
      }

      // Delete chat snapshot from localStorage
      try {
        const snapshotKey = `snapshot:${id}`;
        localStorage.removeItem(snapshotKey);
        console.log('Removed snapshot for chat:', id);
      } catch (snapshotError) {
        console.error(`Error deleting snapshot for chat ${id}:`, snapshotError);
      }

      // Delete the chat from the database
      await deleteById(db, id);
      console.log('Successfully deleted chat:', id);
    },
    [db],
  );

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      event.stopPropagation();

      // Log the delete operation to help debugging
      console.log('Attempting to delete chat:', { id: item.id, description: item.description });

      deleteChat(item.id)
        .then(() => {
          toast.success('Chat deleted successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Always refresh the list
          loadEntries();

          if (chatId.get() === item.id) {
            // hard page navigation to clear the stores
            console.log('Navigating away from deleted chat');
            window.location.pathname = '/';
          }
        })
        .catch((error) => {
          console.error('Failed to delete chat:', error);
          toast.error('Failed to delete conversation', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Still try to reload entries in case data has changed
          loadEntries();
        });
    },
    [loadEntries, deleteChat],
  );

  const deleteSelectedItems = useCallback(
    async (itemsToDeleteIds: string[]) => {
      if (!db || itemsToDeleteIds.length === 0) {
        console.log('Bulk delete skipped: No DB or no items to delete.');
        return;
      }

      console.log(`Starting bulk delete for ${itemsToDeleteIds.length} chats`, itemsToDeleteIds);

      let deletedCount = 0;
      const errors: string[] = [];
      const currentChatId = chatId.get();
      let shouldNavigate = false;

      // Process deletions sequentially using the shared deleteChat logic
      for (const id of itemsToDeleteIds) {
        try {
          await deleteChat(id);
          deletedCount++;

          if (id === currentChatId) {
            shouldNavigate = true;
          }
        } catch (error) {
          console.error(`Error deleting chat ${id}:`, error);
          errors.push(id);
        }
      }

      // Show appropriate toast message
      if (errors.length === 0) {
        toast.success(`${deletedCount} chat${deletedCount === 1 ? '' : 's'} deleted successfully`);
      } else {
        toast.warning(`Deleted ${deletedCount} of ${itemsToDeleteIds.length} chats. ${errors.length} failed.`, {
          autoClose: 5000,
        });
      }

      // Reload the list after all deletions
      await loadEntries();

      // Clear selection state
      setSelectedItems([]);
      setSelectionMode(false);

      // Navigate if needed
      if (shouldNavigate) {
        console.log('Navigating away from deleted chat');
        window.location.pathname = '/';
      }
    },
    [deleteChat, loadEntries, db],
  );

  const closeDialog = () => {
    setDialogContent(null);
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);

    if (selectionMode) {
      // If turning selection mode OFF, clear selection
      setSelectedItems([]);
    }
  };

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const newSelectedItems = prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id];
      console.log('Selected items updated:', newSelectedItems);

      return newSelectedItems; // Return the new array
    });
  }, []); // No dependencies needed

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.info('Select at least one chat to delete');
      return;
    }

    const selectedChats = list.filter((item) => selectedItems.includes(item.id));

    if (selectedChats.length === 0) {
      toast.error('Could not find selected chats');
      return;
    }

    setDialogContent({ type: 'bulkDelete', items: selectedChats });
  }, [selectedItems, list]); // Keep list dependency

  const selectAll = useCallback(() => {
    const allFilteredIds = filteredList.map((item) => item.id);
    setSelectedItems((prev) => {
      const allFilteredAreSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => prev.includes(id));

      if (allFilteredAreSelected) {
        // Deselect only the filtered items
        const newSelectedItems = prev.filter((id) => !allFilteredIds.includes(id));
        console.log('Deselecting all filtered items. New selection:', newSelectedItems);

        return newSelectedItems;
      } else {
        // Select all filtered items, adding them to any existing selections
        const newSelectedItems = [...new Set([...prev, ...allFilteredIds])];
        console.log('Selecting all filtered items. New selection:', newSelectedItems);

        return newSelectedItems;
      }
    });
  }, [filteredList]); // Depends only on filteredList

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleDuplicate = async (id: string) => {
    await duplicateCurrentChat(id);
    loadEntries(); // Reload the list after duplication
  };

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  const setDialogContentWithLogging = useCallback((content: DialogContent) => {
    console.log('Setting dialog content:', content);
    setDialogContent(content);
  }, []);

  return (
    <>
      <div
        ref={menuRef}
        style={{ width: collapsed ? '72px' : '312px' }}
        className={classNames(
          'flex selection-accent flex-col side-menu relative h-full shrink-0 rounded-r-2xl transition-[width] duration-200',
          'bg-bolt-elements-background-depth-1 border-r border-bolt-elements-borderColor',
          'shadow-sm text-sm',
          isSettingsOpen ? 'z-40' : 'z-sidebar',
        )}
      >
        {/* Sidebar header — adapts to collapsed / expanded */}
        {collapsed ? (
          <div className="flex flex-col items-center pt-3 pb-2 gap-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-tr-2xl">
            <a href="/" className="flex items-center justify-center" title="Bolt2.dyi">
              <img
                src="/logo.svg"
                alt="Bolt2.dyi"
                style={{ height: '22px', width: 'auto', transform: 'rotate(-90deg)' }}
              />
            </a>
            <button
              className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <span className="i-ph:sidebar-simple-fill w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="h-12 flex items-center justify-between px-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 rounded-tr-2xl">
            <a href="/" className="flex items-center gap-2" title="Bolt2.dyi">
              <img src="/logo.svg" alt="Bolt2.dyi" className="h-6 w-auto" />
            </a>
            <div className="flex items-center gap-2">
              <HelpButton onClick={() => window.open('https://stackblitz-labs.github.io/bolt.diy/', '_blank')} />
              <button
                className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <span className="i-ph:sidebar-simple w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {!collapsed && <CurrentDateTime />}

        {collapsed ? (
          <div className="flex-1 flex flex-col items-center gap-1.5 py-3">
            {/* New Chat */}
            <a
              href="/"
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:brightness-110 transition-colors"
              title="New chat"
            >
              <span className="inline-block i-ph:plus-circle h-5 w-5" />
            </a>
            {/* Search */}
            <button
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 transition-colors"
              title="Search chats"
              onClick={() => {
                setCollapsed(false);
                setActiveSection('chats');
              }}
            >
              <span className="inline-block i-ph:magnifying-glass h-5 w-5" />
            </button>
            {/* Customize */}
            <button
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 transition-colors"
              title="Customize"
              onClick={handleSettingsClick}
            >
              <span className="inline-block i-ph:sliders-horizontal h-5 w-5" />
            </button>

            <div className="w-6 h-px bg-bolt-elements-borderColor/70 my-1" />

            {/* Chats */}
            <button
              className={classNames(
                'inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
                activeSection === 'chats'
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
              )}
              title="Chats"
              onClick={() => {
                setCollapsed(false);
                setActiveSection('chats');
              }}
            >
              <span className="inline-block i-ph:chat-circle h-5 w-5" />
            </button>
            {/* Projects */}
            <button
              className={classNames(
                'inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
                activeSection === 'projects'
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
              )}
              title="Projects"
              onClick={() => {
                setCollapsed(false);
                setActiveSection('projects');
              }}
            >
              <span className="inline-block i-ph:folder h-5 w-5" />
            </button>
            {/* Artifacts */}
            <button
              className={classNames(
                'inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
                activeSection === 'artifacts'
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
              )}
              title="Artifacts"
              onClick={() => {
                setCollapsed(false);
                setActiveSection('artifacts');
              }}
            >
              <span className="inline-block i-ph:cube h-5 w-5" />
            </button>
            {/* Code */}
            <button
              className={classNames(
                'inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
                activeSection === 'code'
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
              )}
              title="Code"
              onClick={() => {
                setCollapsed(false);
                setActiveSection('code');
              }}
            >
              <span className="inline-block i-ph:brackets-curly h-5 w-5" />
            </button>

            <div className="w-6 h-px bg-bolt-elements-borderColor/70 my-1" />

            {/* Help */}
            <button
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 transition-colors"
              title="Help"
              onClick={() => window.open('https://stackblitz-labs.github.io/bolt.diy/', '_blank')}
            >
              <span className="inline-block i-ph:question h-5 w-5" />
            </button>
            <div className="mt-auto pb-3 flex flex-col items-center gap-2">
              {/* Profile initials circle */}
              <button
                className="flex items-center justify-center w-9 h-9 rounded-full bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent text-xs font-semibold overflow-hidden"
                title={profile?.username || 'Guest User'}
                onClick={handleSettingsClick}
              >
                {profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile?.username || 'User'}
                    className="w-full h-full object-cover"
                    loading="eager"
                    decoding="sync"
                  />
                ) : (
                  getInitials(profile?.username)
                )}
              </button>
              {/* Vertical theme toggle buttons */}
              <button
                onClick={() => setThemeMode('light')}
                className={classNames(
                  'inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                  themeMode === 'light'
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary',
                )}
                title="Light theme"
              >
                <span className="i-ph:sun h-4 w-4" />
              </button>
              <button
                onClick={() => setThemeMode('dark')}
                className={classNames(
                  'inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                  themeMode === 'dark'
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary',
                )}
                title="Dark theme"
              >
                <span className="i-ph:moon h-4 w-4" />
              </button>
              <button
                onClick={() => setThemeMode('system')}
                className={classNames(
                  'inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                  themeMode === 'system'
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary',
                )}
                title="System theme"
              >
                <span className="i-ph:monitor h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
            <div className="px-3 pt-3 pb-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2/70 space-y-1.5">
              <a
                href="/"
                className="flex items-center rounded-lg px-3 py-2 text-[15px] bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:brightness-110 transition-colors"
              >
                New chat
              </a>
              <button
                className="flex w-full items-center rounded-lg px-3 py-2 text-[15px] bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 transition-colors"
                onClick={() => setActiveSection('chats')}
              >
                Search
              </button>

              <button
                className="flex w-full items-center rounded-lg px-3 py-2 text-[15px] bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 transition-colors"
                onClick={handleSettingsClick}
              >
                Customize
              </button>

              <div className="h-px bg-bolt-elements-borderColor/70" />

              <div className="space-y-1">
                <div className="px-1 text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
                  Navigation
                </div>
                <button
                  className={classNames(
                    'flex items-center rounded-lg px-3 py-2 text-[15px] transition-colors',
                    activeSection === 'chats'
                      ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                      : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
                  )}
                  onClick={() => setActiveSection('chats')}
                >
                  Chats
                </button>
                <button
                  className={classNames(
                    'flex items-center rounded-lg px-3 py-2 text-[15px] transition-colors',
                    activeSection === 'projects'
                      ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                      : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
                  )}
                  onClick={() => setActiveSection('projects')}
                >
                  Projects
                </button>
                <button
                  className={classNames(
                    'flex items-center rounded-lg px-3 py-2 text-[15px] transition-colors',
                    activeSection === 'artifacts'
                      ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                      : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
                  )}
                  onClick={() => setActiveSection('artifacts')}
                >
                  Artifacts
                </button>
                <button
                  className={classNames(
                    'flex items-center rounded-lg px-3 py-2 text-[15px] transition-colors',
                    activeSection === 'code'
                      ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                      : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2',
                  )}
                  onClick={() => setActiveSection('code')}
                >
                  Code
                </button>
              </div>
            </div>

            {activeSection === 'chats' && (
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={toggleSelectionMode}
                    className={classNames(
                      'flex gap-1 items-center rounded-lg px-3 py-2 transition-colors',
                      selectionMode
                        ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent border border-bolt-elements-borderColor'
                        : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
                    )}
                    aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
                  >
                    <span className={selectionMode ? 'i-ph:x h-4 w-4' : 'i-ph:check-square h-4 w-4'} />
                  </button>
                </div>
                <div className="relative w-full">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <span className="i-ph:magnifying-glass h-4 w-4 text-bolt-elements-textTertiary" />
                  </div>
                  <input
                    className="w-full bg-bolt-elements-background-depth-2 relative pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus text-sm text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary border border-bolt-elements-borderColor"
                    type="search"
                    placeholder="Search chats..."
                    onChange={handleSearchChange}
                    aria-label="Search chats"
                  />
                </div>
              </div>
            )}

            {activeSection === 'projects' && (
              <div className="p-4 space-y-3">
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm text-bolt-elements-textSecondary">
                  Projects is a first-class workspace area for collaboration, ownership, and shared conversations.
                </div>
                <CollabPanel />
              </div>
            )}

            {activeSection === 'artifacts' && (
              <div className="p-4">
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm text-bolt-elements-textSecondary">
                  Artifacts can store reusable modules, components, and implementation snippets for future projects.
                </div>
              </div>
            )}

            {activeSection === 'code' && (
              <div className="p-4">
                <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-sm text-bolt-elements-textSecondary">
                  Code section is reserved for project code context and shared implementation assets.
                </div>
              </div>
            )}

            {activeSection === 'chats' && (
              <div className="flex items-center justify-between text-sm px-4 py-2">
                <div className="font-medium text-bolt-elements-textSecondary">Recents</div>
                {selectionMode && (
                  <div className="flex items-center gap-2">
                    <Button variant="text" size="sm" onClick={selectAll}>
                      {selectedItems.length === filteredList.length ? 'Deselect all' : 'Select all'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleBulkDeleteClick}
                      disabled={selectedItems.length === 0}
                    >
                      Delete selected
                    </Button>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'chats' && (
              <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
                {filteredList.length === 0 && (
                  <div className="px-4 text-bolt-elements-textTertiary text-sm">
                    {list.length === 0 ? 'No previous conversations' : 'No matches found'}
                  </div>
                )}
                <DialogRoot open={dialogContent !== null}>
                  {binDates(filteredList).map(({ category, items }) => (
                    <div key={category} className="mt-2 first:mt-0 space-y-1">
                      <div className="text-xs font-medium text-bolt-elements-textTertiary sticky top-0 z-1 bg-bolt-elements-background-depth-1 px-4 py-1">
                        {category}
                      </div>
                      <div className="space-y-0.5 pr-1">
                        {items.map((item) => (
                          <HistoryItem
                            key={item.id}
                            item={item}
                            exportChat={exportChat}
                            onDelete={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              console.log('Delete triggered for item:', item);
                              setDialogContentWithLogging({ type: 'delete', item });
                            }}
                            onDuplicate={() => handleDuplicate(item.id)}
                            selectionMode={selectionMode}
                            isSelected={selectedItems.includes(item.id)}
                            onToggleSelection={toggleItemSelection}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
                    {dialogContent?.type === 'delete' && (
                      <>
                        <div className="p-6 bg-white dark:bg-gray-950">
                          <DialogTitle className="text-gray-900 dark:text-white">Delete Chat?</DialogTitle>
                          <DialogDescription className="mt-2 text-gray-600 dark:text-gray-400">
                            <p>
                              You are about to delete{' '}
                              <span className="font-medium text-gray-900 dark:text-white">
                                {dialogContent.item.description}
                              </span>
                            </p>
                            <p className="mt-2">Are you sure you want to delete this chat?</p>
                          </DialogDescription>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                          <DialogButton type="secondary" onClick={closeDialog}>
                            Cancel
                          </DialogButton>
                          <DialogButton
                            type="danger"
                            onClick={(event) => {
                              console.log('Dialog delete button clicked for item:', dialogContent.item);
                              deleteItem(event, dialogContent.item);
                              closeDialog();
                            }}
                          >
                            Delete
                          </DialogButton>
                        </div>
                      </>
                    )}
                    {dialogContent?.type === 'bulkDelete' && (
                      <>
                        <div className="p-6 bg-white dark:bg-gray-950">
                          <DialogTitle className="text-gray-900 dark:text-white">Delete Selected Chats?</DialogTitle>
                          <DialogDescription className="mt-2 text-gray-600 dark:text-gray-400">
                            <p>
                              You are about to delete {dialogContent.items.length}{' '}
                              {dialogContent.items.length === 1 ? 'chat' : 'chats'}:
                            </p>
                            <div className="mt-2 max-h-32 overflow-auto border border-gray-100 dark:border-gray-800 rounded-md bg-gray-50 dark:bg-gray-900 p-2">
                              <ul className="list-disc pl-5 space-y-1">
                                {dialogContent.items.map((item) => (
                                  <li key={item.id} className="text-sm">
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      {item.description}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <p className="mt-3">Are you sure you want to delete these chats?</p>
                          </DialogDescription>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                          <DialogButton type="secondary" onClick={closeDialog}>
                            Cancel
                          </DialogButton>
                          <DialogButton
                            type="danger"
                            onClick={() => {
                              /*
                               * Pass the current selectedItems to the delete function.
                               * This captures the state at the moment the user confirms.
                               */
                              const itemsToDeleteNow = [...selectedItems];
                              console.log(
                                'Bulk delete confirmed for',
                                itemsToDeleteNow.length,
                                'items',
                                itemsToDeleteNow,
                              );
                              deleteSelectedItems(itemsToDeleteNow);
                              closeDialog();
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
            )}
            <div className="mt-auto flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <SettingsButton onClick={handleSettingsClick} />
                <div className="flex items-center gap-2 min-w-0 rounded-full border border-bolt-elements-borderColor px-2 py-1">
                  <div className="flex items-center justify-center w-7 h-7 overflow-hidden bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary rounded-full shrink-0">
                    {profile?.avatar ? (
                      <img
                        src={profile.avatar}
                        alt={profile?.username || 'User'}
                        className="w-full h-full object-cover"
                        loading="eager"
                        decoding="sync"
                      />
                    ) : (
                      <span className="text-xs font-semibold leading-none">{getInitials(profile?.username)}</span>
                    )}
                  </div>
                  <span className="text-xs text-bolt-elements-textSecondary truncate max-w-24">
                    {profile?.username || 'Guest User'}
                  </span>
                </div>
              </div>
              <ThemeSwitch />
            </div>
          </div>
        )}
      </div>

      <ControlPanel open={isSettingsOpen} onClose={handleSettingsClose} />
    </>
  );
};
