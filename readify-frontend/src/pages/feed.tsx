import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import { FeedItemCard } from '../components/feed/FeedItemCard';
import { NewEntryModal } from '../components/feed/NewEntryModal';
import { PlusIcon } from '../components/icons';
import { MOCK_FEED_ITEMS } from '../lib/mockFeedData';
import { addCommentToTree } from '../lib/commentUtils';
import { formatRelativeTime } from '../lib/formatRelativeTime';
import type { CreateEntryPayload, FeedComment, FeedItem } from '../types/feed';
import apiClient from '../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') ?? 'http://localhost:4000';

function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

interface BackendUser {
  userId: number;
  name: string;
  username: string;
  profilePicture: string | null;
  bio: string | null;
}

interface BackendAuthor {
  userId: number;
  name: string;
  username: string;
  profilePicture: string | null;
}

interface BackendFeedPost {
  type: 'post';
  postId: number;
  caption: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'JUST_ME';
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  author: BackendAuthor;
  book: null;
}

interface BackendFeedReview {
  type: 'review';
  reviewId: number;
  rating: number;
  review: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  author: BackendAuthor;
  book: { bookId: number; title: string; author: string; coverImage: string | null; rating?: number; noOfRatings?: number };
}

type BackendFeedRow = BackendFeedPost | BackendFeedReview;

interface CreatedPostResponse {
  postId: number;
  caption: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'JUST_ME';
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
  commentCount?: number;
}

interface CreatedReviewResponse {
  reviewId: number;
  rating: number;
  review: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
  commentCount?: number;
  book: BackendFeedReview['book'];
}

interface FeedResponse {
  items: BackendFeedRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface BackendQuote {
  quoteId: number;
  quote: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  author: BackendAuthor;
}

interface BackendComment {
  commentId: number;
  parentCommentId: number | null;
  comment: string;
  createdAt: string;
  author: { userId: number; name: string; username: string; profilePicture: string | null };
}

interface FriendQuotePreview {
  id: string;
  authorName: string;
  authorUsername: string;
  content: string;
  likedByMe: boolean;
  likeCount: number;
  sharedAt: string;
}

function authorToFeedAuthor(author: BackendAuthor) {
  return {
    id: String(author.userId),
    name: author.name,
    username: author.username,
    avatarUrl: resolveMediaUrl(author.profilePicture),
  };
}

function toFeedItem(row: BackendFeedRow): FeedItem {
  if (row.type === 'post') {
    return {
      id: String(row.postId),
      type: 'post',
      author: authorToFeedAuthor(row.author),
      content: row.caption,
      createdAt: row.createdAt,
      visibility: row.visibility === 'JUST_ME' ? 'only_me' : (row.visibility.toLowerCase() as 'public' | 'private'),
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      repostCount: 0,
      likedByMe: row.likedByMe,
      bookmarkedByMe: false,
      repostedByMe: false,
      comments: [],
    };
  }

  return {
    id: `review-${row.reviewId}`,
    type: 'review',
    author: authorToFeedAuthor(row.author),
    book: {
      id: String(row.book.bookId),
      title: row.book.title,
      author: row.book.author,
      coverUrl: resolveMediaUrl(row.book.coverImage),
      // The book's average rating (from the books table), not this reviewer's rating.
      rating: row.book.rating ?? row.rating,
    },
    userRating: row.rating,
    content: row.review,
    createdAt: row.createdAt,
    visibility: 'public',
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    repostCount: 0,
    likedByMe: row.likedByMe,
    bookmarkedByMe: false,
    repostedByMe: false,
    comments: [],
  };
}

// Turns the flat, oldest-first list the backend returns into the nested
// reply tree FeedItemCard/CommentSection expect, using parentCommentId.
function buildCommentTree(flat: BackendComment[]): FeedComment[] {
  const byId = new Map<string, FeedComment>();
  const parentOf = new Map<string, string | null>();

  flat.forEach((c) => {
    byId.set(String(c.commentId), {
      id: String(c.commentId),
      author: {
        id: String(c.author.userId),
        name: c.author.name,
        username: c.author.username,
        avatarUrl: resolveMediaUrl(c.author.profilePicture),
      },
      content: c.comment,
      createdAt: c.createdAt,
      replies: [],
    });
    parentOf.set(String(c.commentId), c.parentCommentId ? String(c.parentCommentId) : null);
  });

  const roots: FeedComment[] = [];
  byId.forEach((node, id) => {
    const parentId = parentOf.get(id);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

// ---------------------------------------------------------------------------
// Demo data: shown when the backend is unreachable (network/connection error),
// so the page still renders something meaningful instead of a blank error.
// This is local-only - nothing here is ever persisted to a server.
// ---------------------------------------------------------------------------

const DEMO_USER: BackendUser = {
  userId: 0,
  name: 'Alex',
  username: 'alex.reads',
  profilePicture: null,
  bio: null,
};

const DEMO_QUOTES: FriendQuotePreview[] = [
  {
    id: 'demo-quote-1',
    authorName: 'Maya',
    authorUsername: 'maya.reads',
    content: 'The best stories are the ones that make you want to stay up just a little longer.',
    likedByMe: false,
    likeCount: 14,
    sharedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'demo-quote-2',
    authorName: 'Jules',
    authorUsername: 'julesbookclub',
    content: 'Reading changes the shape of your thoughts, and that is rarely a bad thing.',
    likedByMe: true,
    likeCount: 21,
    sharedAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
  },
];

/**
 * True when a request failed because the backend couldn't be reached at all
 * (connection refused, DNS failure, timeout, CORS, etc) - as opposed to a
 * real server response like a 401 or 500.
 */
function isBackendUnreachable(error: unknown): boolean {
  if (isAxiosError(error)) {
    // No response means the request never made it to a server.
    return !error.response;
  }
  return false;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

const PAGE_SIZE = 20;

export default function Feed() {
  const [viewer, setViewer] = useState<BackendUser | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [friendQuotes, setFriendQuotes] = useState<FriendQuotePreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryModalMode, setEntryModalMode] = useState<'post' | 'review'>('post');

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadFeed() {
      setIsLoading(true);
      setLoadError('');
      setIsDemoMode(false);
      try {
        const [viewerResponse, feedResponse, quotesResponse] = await Promise.all([
          apiClient.get<{ user: BackendUser }>('/auth/me'),
          apiClient.get<FeedResponse>('/feed', { params: { limit: PAGE_SIZE, offset: 0 } }),
          apiClient.get<{ quotes: BackendQuote[] }>('/feed/quotes'),
        ]);

        if (!isCurrentRequest) return;
        setViewer(viewerResponse.data.user);
        setItems(feedResponse.data.items.map(toFeedItem));
        setHasMore(feedResponse.data.hasMore);
        setFriendQuotes(
          quotesResponse.data.quotes.map((q) => ({
            id: String(q.quoteId),
            authorName: q.author.name,
            authorUsername: q.author.username,
            content: q.quote,
            likedByMe: q.likedByMe,
            likeCount: q.likeCount,
            sharedAt: q.createdAt,
          }))
        );
      } catch (error) {
        if (!isCurrentRequest) return;

        if (isBackendUnreachable(error)) {
          // Backend isn't running/reachable - fall back to local demo data
          // instead of showing an error, so the page still demonstrates the UI.
          setViewer(DEMO_USER);
          setItems(MOCK_FEED_ITEMS);
          setHasMore(false);
          setFriendQuotes(DEMO_QUOTES);
          setIsDemoMode(true);
        } else {
          setLoadError('Unable to load your feed. Please try again.');
          setItems([]);
          setFriendQuotes([]);
        }
      } finally {
        if (isCurrentRequest) setIsLoading(false);
      }
    }

    void loadFeed();
    return () => {
      isCurrentRequest = false;
    };
  }, []);

  const currentUserName = viewer?.name ?? '';
  const currentUserId = viewer ? String(viewer.userId) : undefined;

  const handleLoadMore = async () => {
    if (isDemoMode || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const response = await apiClient.get<FeedResponse>('/feed', {
        params: { limit: PAGE_SIZE, offset: items.length },
      });
      setItems((current) => [...current, ...response.data.items.map(toFeedItem)]);
      setHasMore(response.data.hasMore);
    } catch {
      toast.error('Unable to load more posts. Please try again.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleToggleLike = async (id: string) => {
    const isReview = id.startsWith('review-');
    const targetId = isReview ? id.replace(/^review-/, '') : id;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const wasLiked = item.likedByMe;
    const previousCount = item.likeCount;

    // Optimistic update - reflected immediately, then reconciled (or rolled
    // back) once the request settles.
    setItems((current) =>
      current.map((i) =>
        i.id === id ? { ...i, likedByMe: !wasLiked, likeCount: wasLiked ? i.likeCount - 1 : i.likeCount + 1 } : i
      )
    );

    if (isDemoMode) return; // nothing to persist in demo mode

    try {
      const endpoint = `/${isReview ? 'reviews' : 'posts'}/${targetId}/like`;
      const response = wasLiked
        ? await apiClient.delete<{ likeCount: number; likedByMe: boolean }>(endpoint)
        : await apiClient.post<{ likeCount: number; likedByMe: boolean }>(endpoint);

      setItems((current) =>
        current.map((i) =>
          i.id === id ? { ...i, likeCount: response.data.likeCount, likedByMe: response.data.likedByMe } : i
        )
      );
    } catch {
      setItems((current) =>
        current.map((i) => (i.id === id ? { ...i, likedByMe: wasLiked, likeCount: previousCount } : i))
      );
      toast.error('Unable to update like. Please try again.');
    }
  };

  // Bookmarking only applies to reviews (see FeedItemCard - the button is
  // hidden entirely for posts) and means "save this book to my wishlist".
  const handleToggleBookmark = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.type !== 'review' || !item.book) return;

    if (item.bookmarkedByMe) {
      // Already saved - nothing to undo server-side for now, just reflect it.
      return;
    }

    setItems((current) => current.map((i) => (i.id === id ? { ...i, bookmarkedByMe: true } : i)));

    if (isDemoMode) {
      toast.success('Book saved to wishlist (demo mode — not saved to a server)');
      return;
    }

    try {
      await apiClient.post('/users/me/shelf', {
        status: 'want-to-read',
        bookId: Number.isInteger(Number(item.book.id)) ? Number(item.book.id) : undefined,
        title: item.book.title,
        author: item.book.author,
      });
      toast.success('Book saved to your wishlist!');
    } catch {
      setItems((current) => current.map((i) => (i.id === id ? { ...i, bookmarkedByMe: false } : i)));
      toast.error('Unable to save this book. Please try again.');
    }
  };

  const handleDeleteItem = async (id: string) => {
    const isReview = id.startsWith('review-');
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (!isDemoMode) {
      try {
        if (isReview) {
          await apiClient.delete(`/reviews/${id.replace(/^review-/, '')}`);
        } else {
          await apiClient.delete(`/posts/${id}`);
        }
      } catch {
        toast.error('Unable to delete. Please try again.');
        return;
      }
    }

    setItems((current) => current.filter((i) => i.id !== id));
    toast.success('Deleted');
  };

  // Fetches the full comment thread for a post/review the first time its
  // comment section is opened - the feed endpoint only sends back a
  // commentCount, not the comments themselves.
  const [loadedCommentItemIds, setLoadedCommentItemIds] = useState<Set<string>>(new Set());

  const handleOpenComments = async (itemId: string) => {
    if (isDemoMode || loadedCommentItemIds.has(itemId)) return;

    const isReview = itemId.startsWith('review-');
    const targetId = isReview ? itemId.replace(/^review-/, '') : itemId;

    try {
      const response = await apiClient.get<{ comments: BackendComment[] }>(
        `/${isReview ? 'reviews' : 'posts'}/${targetId}/comments`
      );
      const tree = buildCommentTree(response.data.comments);
      setItems((current) => current.map((item) => (item.id === itemId ? { ...item, comments: tree } : item)));
      setLoadedCommentItemIds((current) => new Set(current).add(itemId));
    } catch {
      // A failed background comment fetch isn't worth interrupting the user
      // with a toast - the section just stays empty until they retry.
    }
  };

  const handleAddComment = async (itemId: string, parentCommentId: string | null, content: string) => {
    const isReview = itemId.startsWith('review-');
    const targetId = isReview ? itemId.replace(/^review-/, '') : itemId;

    if (isDemoMode) {
      const newComment: FeedComment = {
        id: `comment-${Date.now()}`,
        author: { id: currentUserId ?? '', name: currentUserName, username: viewer?.username ?? '' },
        content,
        createdAt: new Date().toISOString(),
        replies: [],
      };
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, comments: addCommentToTree(item.comments, parentCommentId, newComment), commentCount: item.commentCount + 1 }
            : item
        )
      );
      return;
    }

    try {
      const endpoint = `/${isReview ? 'reviews' : 'posts'}/${targetId}/comments`;
      const response = await apiClient.post<{ comment: BackendComment }>(endpoint, {
        comment: content,
        parentCommentId: parentCommentId ? Number(parentCommentId) : undefined,
      });
      const c = response.data.comment;
      const newComment: FeedComment = {
        id: String(c.commentId),
        author: {
          id: String(c.author.userId),
          name: c.author.name,
          username: c.author.username,
          avatarUrl: resolveMediaUrl(c.author.profilePicture),
        },
        content: c.comment,
        createdAt: c.createdAt,
        replies: [],
      };
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, comments: addCommentToTree(item.comments, parentCommentId, newComment), commentCount: item.commentCount + 1 }
            : item
        )
      );
    } catch {
      toast.error('Unable to add comment. Please try again.');
    }
  };

  const handleCreateEntry = async (payload: CreateEntryPayload) => {
    if (!viewer) return;

    if (isDemoMode) {
      const author = { id: String(viewer.userId), name: viewer.name, username: viewer.username };
      const book = {
        id: `book-${Date.now()}`,
        title: payload.bookTitle,
        author: payload.bookAuthor,
        rating: payload.rating,
      };
      const base = {
        id: `${payload.isReview ? 'review' : 'post'}-${Date.now()}`,
        author,
        content: payload.content,
        createdAt: new Date().toISOString(),
        visibility: payload.visibility,
        likeCount: 0,
        commentCount: 0,
        repostCount: 0,
        likedByMe: false,
        bookmarkedByMe: false,
        repostedByMe: false,
        comments: [] as FeedComment[],
      };
      const newItem: FeedItem = payload.isReview
        ? { ...base, type: 'review', book, userRating: payload.rating }
        : { ...base, type: 'post' };
      setItems((current) => [newItem, ...current]);
      toast.success(`${payload.isReview ? 'Review' : 'Post'} published (demo mode — not saved to a server)`);
      return;
    }

    // The create endpoints don't send the author back, so build it from the
    // logged-in user (this is what the profile page does too).
    const viewerAuthor: BackendAuthor = {
      userId: viewer.userId,
      name: viewer.name,
      username: viewer.username,
      profilePicture: viewer.profilePicture,
    };

    try {
      if (payload.isReview) {
        const response = await apiClient.post<{ review: CreatedReviewResponse }>('/reviews', {
          rating: payload.rating,
          review: payload.content,
          // If the user picked a suggestion, send its bookId so the backend
          // reuses that exact book instead of matching by title+author.
          ...(payload.bookId
            ? { bookId: Number(payload.bookId) }
            : { title: payload.bookTitle, author: payload.bookAuthor }),
        });
        const created = response.data.review;
        const newReview = toFeedItem({
          ...created,
          type: 'review',
          author: viewerAuthor,
          likeCount: created.likeCount ?? 0,
          likedByMe: created.likedByMe ?? false,
          commentCount: created.commentCount ?? 0,
        });
        setItems((current) => [newReview, ...current]);
        toast.success('Review published!');
      } else {
        const response = await apiClient.post<{ post: CreatedPostResponse }>('/posts', {
          caption: payload.content,
          visibility: payload.visibility === 'only_me' ? 'JUST_ME' : payload.visibility.toUpperCase(),
        });
        const created = response.data.post;
        const newPost = toFeedItem({
          ...created,
          type: 'post',
          author: viewerAuthor,
          book: null,
          likeCount: created.likeCount ?? 0,
          likedByMe: created.likedByMe ?? false,
          commentCount: created.commentCount ?? 0,
        });
        setItems((current) => [newPost, ...current]);
        toast.success('Posted!');
      }
    } catch {
      toast.error(`Unable to publish this ${payload.isReview ? 'review' : 'post'}. Please try again.`);
    }
  };

  const handleToggleFriendQuoteLike = async (id: string) => {
    const quote = friendQuotes.find((q) => q.id === id);
    if (!quote) return;

    const wasLiked = quote.likedByMe;
    const previousCount = quote.likeCount;

    setFriendQuotes((current) =>
      current.map((q) =>
        q.id === id ? { ...q, likedByMe: !wasLiked, likeCount: wasLiked ? q.likeCount - 1 : q.likeCount + 1 } : q
      )
    );

    if (isDemoMode) return;

    try {
      const response = wasLiked
        ? await apiClient.delete<{ likeCount: number; likedByMe: boolean }>(`/quotes/${id}/like`)
        : await apiClient.post<{ likeCount: number; likedByMe: boolean }>(`/quotes/${id}/like`);
      setFriendQuotes((current) =>
        current.map((q) => (q.id === id ? { ...q, likeCount: response.data.likeCount, likedByMe: response.data.likedByMe } : q))
      );
    } catch {
      setFriendQuotes((current) =>
        current.map((q) => (q.id === id ? { ...q, likedByMe: wasLiked, likeCount: previousCount } : q))
      );
      toast.error('Unable to update like. Please try again.');
    }
  };

  return (
    <div className="w-full">
      {isLoading && <p className="text-sm text-textSecondary">Loading your feed...</p>}
      {!isLoading && loadError && <p className="text-sm text-error">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {isDemoMode && (
            <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
              Showing demo data — the backend isn't reachable right now. Changes here won't be saved.
            </div>
          )}

          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-text dark:text-text-dark sm:text-2xl">
                {getGreeting()}, {currentUserName}
              </h1>
              <p className="mt-1 text-sm text-textSecondary dark:text-textSecondary-dark">Here's what your reading community is sharing</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setEntryModalMode('post');
                  setIsEntryModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-primary/90"
              >
                <PlusIcon className="h-4 w-4" />
                New Post
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryModalMode('review');
                  setIsEntryModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-colors duration-150 hover:bg-primary/5 dark:bg-gray-900"
              >
                <PlusIcon className="h-4 w-4" />
                New Review
              </button>
            </div>
          </div>

          {friendQuotes.length > 0 && (
            <div className="mb-6 rounded-2xl border border-gray-100 bg-card p-4 shadow-sm dark:border-gray-800 dark:bg-card-dark sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-text dark:text-text-dark">Quotes from friends</h2>
                  <p className="text-sm text-textSecondary dark:text-textSecondary-dark">Shared in the last 24 hours</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {friendQuotes.map((quote) => (
                  <div key={quote.id} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/70">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-text dark:text-text-dark">{quote.authorName}</p>
                        <p className="text-xs text-textSecondary dark:text-textSecondary-dark">@{quote.authorUsername}</p>
                      </div>
                      <span className="text-xs text-textSecondary dark:text-textSecondary-dark">{formatRelativeTime(quote.sharedAt)}</span>
                    </div>
                    <p className="mt-2 break-words text-sm italic text-textSecondary dark:text-textSecondary-dark">“{quote.content}”</p>
                    <button
                      type="button"
                      onClick={() => handleToggleFriendQuoteLike(quote.id)}
                      className={`mt-3 text-sm font-semibold transition-colors ${quote.likedByMe ? 'text-primary' : 'text-textSecondary hover:text-primary dark:text-textSecondary-dark'}`}
                    >
                      ♥ {quote.likeCount}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <FeedItemCard
                  key={item.id}
                  item={item}
                  currentUserName={currentUserName}
                  currentUserId={currentUserId}
                  onToggleLike={handleToggleLike}
                  onToggleBookmark={handleToggleBookmark}
                  onAddComment={handleAddComment}
                  onOpenComments={handleOpenComments}
                  onDelete={handleDeleteItem}
                />
              ))}
            </AnimatePresence>

            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 bg-card dark:bg-card-dark p-10 text-center">
                <p className="text-sm font-medium text-text dark:text-text-dark">No posts yet</p>
                <p className="mt-1 text-sm text-textSecondary dark:text-textSecondary-dark">Be the first to share what you're reading.</p>
              </div>
            )}

            {hasMore && !isDemoMode && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="rounded-full border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-textSecondary dark:text-textSecondary-dark transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </div>

          <AnimatePresence>
            {isEntryModalOpen && (
              <NewEntryModal
                key={`entry-modal-${entryModalMode}`}
                onClose={() => setIsEntryModalOpen(false)}
                onSubmit={handleCreateEntry}
                initialMode={entryModalMode}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}