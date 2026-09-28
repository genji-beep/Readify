import { useEffect, useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import { Plus, X, CheckCircle2, Trash2 } from "lucide-react";
import { NewEntryModal } from "../components/feed/NewEntryModal";
import type { CreateEntryPayload } from "../types/feed";
import apiClient from "../lib/api";

interface ShelfBook {
  bookId: number;
  title: string;
  author: string;
  coverUrl: string;
  status: ShelfTab;
}

interface BookSuggestion {
  bookId: number;
  title: string;
  author: string;
  coverImage?: string | null;
}

type ShelfTab = "currently-reading" | "want-to-read" | "finished";

interface BackendShelfBook {
  bookId: number;
  title: string;
  author: string;
  coverImage: string | null;
}

interface BackendShelfResponse {
  "currently-reading": BackendShelfBook[];
  "want-to-read": BackendShelfBook[];
  finished: BackendShelfBook[];
}

const TABS: { key: ShelfTab; label: string }[] = [
  { key: "currently-reading", label: "Currently Reading" },
  { key: "want-to-read", label: "Wishlist" },
  { key: "finished", label: "Finished" },
];

function toShelfBook(book: BackendShelfBook, status: ShelfTab): ShelfBook {
  return {
    bookId: book.bookId,
    title: book.title,
    author: book.author,
    coverUrl: book.coverImage ?? "",
    status,
  };
}

/**
 * True when a request failed because the backend couldn't be reached at all
 * (connection refused, DNS failure, timeout, CORS, etc) - as opposed to a
 * real server response like a 401/500.
 */
function isBackendUnreachable(error: unknown): boolean {
  if (isAxiosError(error)) {
    return !error.response;
  }
  return false;
}

export default function MyShelfPage() {
  const navigate = useNavigate();
  const goToBook = (bookId: number) => navigate(`/books?id=${bookId}`);
  const [activeTab, setActiveTab] = useState<ShelfTab>("currently-reading");
  const [booksByTab, setBooksByTab] = useState<Record<ShelfTab, ShelfBook[]>>({
    "currently-reading": [],
    "want-to-read": [],
    finished: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newStatus, setNewStatus] = useState<ShelfTab>("want-to-read");
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [isFinishPromptOpen, setIsFinishPromptOpen] = useState(false);
  const [bookToFinish, setBookToFinish] = useState<ShelfBook | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'post' | 'review'>('review');
  const [composerPrefill, setComposerPrefill] = useState<{ title: string; author: string } | null>(null);

  // Book title autocomplete for the Add Book modal - same fuzzy/typo-tolerant
  // GET /books/lookup search-as-you-type used when composing a review.
  const [bookSuggestions, setBookSuggestions] = useState<BookSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearchingBooks, setIsSearchingBooks] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<number | undefined>(undefined);
  // Set right before we programmatically fill the title from a selection, so
  // the very next title-change effect run doesn't re-open the dropdown.
  const justSelectedRef = useRef(false);

  useEffect(() => {
    if (!isModalOpen) return;

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    const query = newTitle.trim();
    if (query.length < 2) {
      setBookSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let isCurrent = true;
    setIsSearchingBooks(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await apiClient.get<{ books: BookSuggestion[] }>('/books/lookup', {
          params: { title: query, limit: 6 },
        });
        if (!isCurrent) return;
        setBookSuggestions(response.data.books);
        setShowSuggestions(true);
      } catch {
        if (!isCurrent) return;
        // Lookup is a nice-to-have - if it fails, just fall back to manual entry.
        setBookSuggestions([]);
        setShowSuggestions(false);
      } finally {
        if (isCurrent) setIsSearchingBooks(false);
      }
    }, 300);

    return () => {
      isCurrent = false;
      clearTimeout(timeoutId);
    };
  }, [newTitle, isModalOpen]);

  const handleNewTitleChange = (value: string) => {
    // Any manual edit invalidates a previously-selected suggestion.
    setSelectedBookId(undefined);
    setNewTitle(value);
  };

  const handleSelectBookSuggestion = (suggestion: BookSuggestion) => {
    justSelectedRef.current = true;
    setNewTitle(suggestion.title);
    setNewAuthor(suggestion.author);
    setSelectedBookId(suggestion.bookId);
    setBookSuggestions([]);
    setShowSuggestions(false);
  };

  const loadShelf = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await apiClient.get<BackendShelfResponse>("/users/me/shelf");
      setBooksByTab({
        "currently-reading": response.data["currently-reading"].map((b) => toShelfBook(b, "currently-reading")),
        "want-to-read": response.data["want-to-read"].map((b) => toShelfBook(b, "want-to-read")),
        finished: response.data.finished.map((b) => toShelfBook(b, "finished")),
      });
    } catch (error) {
      if (isBackendUnreachable(error)) {
        setLoadError("Backend isn't reachable right now. Please try again shortly.");
      } else {
        setLoadError("Unable to load your bookshelf. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadShelf();
  }, []);

  const activeBooks = booksByTab[activeTab] ?? [];

  // Handle Add Book Submission
  const handleAddBookSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAuthor.trim() || isAddingBook) return;

    setIsAddingBook(true);
    try {
      const response = await apiClient.post<{ book: BackendShelfBook; status: ShelfTab }>("/users/me/shelf", {
        status: newStatus,
        bookId: selectedBookId,
        title: newTitle.trim(),
        author: newAuthor.trim(),
      });

      const newBookItem = toShelfBook(response.data.book, newStatus);
      setBooksByTab((prev) => ({
        ...prev,
        // Adding a new "currently reading" book replaces whatever was there before,
        // matching the backend's one-current-book-per-user rule.
        [newStatus]:
          newStatus === "currently-reading"
            ? [newBookItem]
            : [newBookItem, ...prev[newStatus].filter((book) => book.bookId !== newBookItem.bookId)],
      }));

      setNewTitle("");
      setNewAuthor("");
      setSelectedBookId(undefined);
      setBookSuggestions([]);
      setShowSuggestions(false);
      setIsModalOpen(false);
      toast.success("Book added to your shelf!");
    } catch {
      toast.error("Unable to add this book. Please try again.");
    } finally {
      setIsAddingBook(false);
    }
  };

  const handleMoveToFinished = async (bookId: number) => {
    const bookToMove = booksByTab["currently-reading"].find((book) => book.bookId === bookId);
    if (!bookToMove) return;

    try {
      await apiClient.patch(`/users/me/shelf/${bookId}/finish`);

      setBooksByTab((prev) => ({
        ...prev,
        "currently-reading": prev["currently-reading"].filter((book) => book.bookId !== bookId),
        finished: [{ ...bookToMove, status: "finished" }, ...prev.finished],
      }));

      setBookToFinish(bookToMove);
      setIsFinishPromptOpen(true);
    } catch {
      toast.error("Unable to update this book. Please try again.");
    }
  };

  const handleRemoveFromWishlist = async (bookId: number) => {
    try {
      await apiClient.delete(`/users/me/shelf/want-to-read/${bookId}`);
      setBooksByTab((prev) => ({
        ...prev,
        "want-to-read": prev["want-to-read"].filter((item) => item.bookId !== bookId),
      }));
    } catch {
      toast.error("Unable to remove this book. Please try again.");
    }
  };

  const handleCreateEntry = async (payload: CreateEntryPayload) => {
    if (!payload.content.trim()) return;

    try {
      if (payload.isReview) {
        await apiClient.post("/reviews", {
          rating: payload.rating,
          review: payload.content,
          title: payload.bookTitle,
          author: payload.bookAuthor,
        });
        toast.success("Review published!");
      } else {
        await apiClient.post("/posts", {
          caption: payload.content,
          visibility: payload.visibility === "only_me" ? "JUST_ME" : payload.visibility.toUpperCase(),
        });
        toast.success("Posted!");
      }
    } catch {
      toast.error("Unable to publish. Please try again.");
    } finally {
      setIsComposerOpen(false);
      setComposerPrefill(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text dark:text-text-dark">My Bookshelf</h1>
            <p className="text-textSecondary dark:text-textSecondary-dark mt-1">Your personal reading collection</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm px-4 py-2.5 rounded-full transition-colors shadow-sm"
          >
            <Plus size={16} />
            Add Book
          </button>
        </div>

        {/* Interactive Tabs */}
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap scrollbar-hide border-b border-gray-200 dark:border-gray-800 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 pb-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? "text-indigo-600 border-indigo-600"
                  : "text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {tab.label} <span className="text-gray-400 dark:text-gray-600">({booksByTab[tab.key]?.length ?? 0})</span>
            </button>
          ))}
        </div>

        {/* Book grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-100 dark:border-gray-800 h-[140px] animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center text-sm text-error shadow-sm">
            {loadError}
          </div>
        ) : activeBooks.length === 0 ? (
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-100 dark:border-gray-800 p-12 text-center text-gray-400 dark:text-gray-500 shadow-sm">
            No books here yet. Use "Add Book" to start filling this shelf.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeBooks.map((book) => (
              <div
                key={book.bookId}
                onClick={() => goToBook(book.bookId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goToBook(book.bookId);
                  }
                }}
                className="bg-white dark:bg-card-dark rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex gap-4 shadow-sm cursor-pointer transition-colors hover:border-indigo-200 dark:hover:border-indigo-800"
              >
                <div className="w-14 h-20 rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0 flex items-center justify-center text-gray-300 dark:text-gray-600 text-xs">
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <span>No Cover</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text dark:text-text-dark text-sm leading-snug line-clamp-2">{book.title}</h3>
                  <p className="text-xs text-textSecondary dark:text-textSecondary-dark mt-0.5">{book.author}</p>

                  {activeTab === "currently-reading" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveToFinished(book.bookId);
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950"
                    >
                      <CheckCircle2 size={14} />
                      Finished reading
                    </button>
                  )}

                  {activeTab === "want-to-read" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromWishlist(book.bookId);
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Book Modal Form */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="max-h-[90vh] overflow-y-auto bg-white dark:bg-card-dark rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-200">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setNewTitle("");
                  setNewAuthor("");
                  setSelectedBookId(undefined);
                  setBookSuggestions([]);
                  setShowSuggestions(false);
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-bold text-text dark:text-text-dark mb-4">Add Book to Shelf</h2>

              <form onSubmit={handleAddBookSubmit} className="space-y-4">
                <div className="relative">
                  <label className="block text-xs font-semibold text-textSecondary dark:text-textSecondary-dark uppercase tracking-wider mb-1">
                    Book Title
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={newTitle}
                      onChange={(e) => handleNewTitleChange(e.target.value)}
                      onFocus={() => {
                        if (bookSuggestions.length > 0) setShowSuggestions(true);
                      }}
                      onBlur={() => {
                        // Small delay so a click on a suggestion registers before the list unmounts.
                        setTimeout(() => setShowSuggestions(false), 150);
                      }}
                      placeholder="e.g., The Hobbit"
                      className="w-full px-3 py-2 pr-9 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-text dark:text-text-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      {isSearchingBooks ? (
                        <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-500" />
                      ) : selectedBookId ? (
                        <span className="text-xs font-semibold text-indigo-600" title="Matched an existing book">
                          ✓
                        </span>
                      ) : null}
                    </span>
                  </div>

                  {showSuggestions && bookSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                      {bookSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.bookId}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleSelectBookSuggestion(suggestion)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                        >
                          <span className="flex h-9 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100 text-[8px] text-gray-400 dark:bg-gray-800">
                            {suggestion.coverImage ? (
                              <img src={suggestion.coverImage} alt="" className="h-full w-full object-cover" />
                            ) : (
                              "N/A"
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-text dark:text-text-dark">{suggestion.title}</span>
                            <span className="block truncate text-xs text-textSecondary dark:text-textSecondary-dark">{suggestion.author}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textSecondary dark:text-textSecondary-dark uppercase tracking-wider mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    required
                    value={newAuthor}
                    onChange={(e) => {
                      // Editing the author after picking a suggestion means this
                      // is no longer necessarily that exact catalog book.
                      setSelectedBookId(undefined);
                      setNewAuthor(e.target.value);
                    }}
                    placeholder="e.g., J.R.R. Tolkien"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-text dark:text-text-dark rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {!selectedBookId && (
                    <p className="mt-1 text-xs text-textSecondary dark:text-textSecondary-dark">
                      Not in our catalog yet? It'll be added when you save.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-textSecondary dark:text-textSecondary-dark uppercase tracking-wider mb-1">
                    Shelf Category
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ShelfTab)}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-text dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="currently-reading">Currently Reading</option>
                    <option value="want-to-read">Wishlist</option>
                    <option value="finished">Finished</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setNewTitle("");
                      setNewAuthor("");
                      setSelectedBookId(undefined);
                      setBookSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-textSecondary dark:text-textSecondary-dark hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingBook}
                    className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAddingBook ? "Saving..." : "Save Book"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isFinishPromptOpen && bookToFinish && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
            <div className="max-h-[90vh] overflow-y-auto bg-white dark:bg-card-dark rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-xl">
              <h2 className="text-xl font-bold text-text dark:text-text-dark">Finished reading?</h2>
              <p className="mt-2 text-sm text-textSecondary dark:text-textSecondary-dark">
                Would you like to leave a review for {bookToFinish.title} and share your thoughts?
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsFinishPromptOpen(false);
                    setBookToFinish(null);
                  }}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-textSecondary hover:bg-gray-100 dark:text-textSecondary-dark dark:hover:bg-gray-800"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComposerPrefill({ title: bookToFinish.title, author: bookToFinish.author });
                    setComposerMode('review');
                    setIsComposerOpen(true);
                    setIsFinishPromptOpen(false);
                    setBookToFinish(null);
                  }}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Write a review
                </button>
              </div>
            </div>
          </div>
        )}

        <NewEntryModal
          isOpen={isComposerOpen}
          onClose={() => {
            setIsComposerOpen(false);
            setComposerPrefill(null);
          }}
          onSubmit={handleCreateEntry}
          initialMode={composerMode}
          initialBookTitle={composerPrefill?.title ?? ""}
          initialBookAuthor={composerPrefill?.author ?? ""}
        />
      </div>
    </DashboardLayout>
  );
}