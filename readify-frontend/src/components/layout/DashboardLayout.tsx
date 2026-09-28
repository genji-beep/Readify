import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Sidebar } from '../feed/Sidebar';
import { AiPickCard } from '../feed/AiPickCard';
import { TrendingCard } from '../feed/TrendingCard';
import { ReadersToFollowCard } from '../feed/ReadersToFollowCard';
import { BookOpenIcon, MenuIcon } from '../icons';
import { MOCK_AI_PICK, MOCK_TRENDING_BOOKS, MOCK_SUGGESTED_READERS } from '../../lib/mockFeedData';
import type { SuggestedReader, TrendingBook } from '../../types/feed';
import type { DiscoverRecommendation } from '../../types/discover';
import apiClient from '../../lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') ?? 'http://localhost:4000';

function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

interface BackendTrendingBook {
  rank: number;
  bookId: number;
  title: string;
  author: string;
  genre?: string;
  coverImage: string | null;
  rating: number;
  noOfRatings?: number;
}

interface BackendSuggestedReader {
  userId: number;
  name: string;
  username: string;
  profilePicture: string | null;
  reviewCount: number;
}

/**
 * True when a request failed because the backend couldn't be reached at all
 * (connection refused, DNS failure, timeout, CORS, etc) - as opposed to a
 * real server response like a 401 or 500.
 */
function isBackendUnreachable(error: unknown): boolean {
  if (isAxiosError(error)) {
    return !error.response;
  }
  return false;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Check if the current route is the feed page
  const isFeedPage = location.pathname === '/' || location.pathname === '/feed';

  const [trendingBooks, setTrendingBooks] = useState<TrendingBook[]>([]);
  const [suggestedReaders, setSuggestedReaders] = useState<SuggestedReader[]>([]);
  const [aiPick, setAiPick] = useState(MOCK_AI_PICK);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Only fetches once the feed page (the only place this sidebar renders) is
  // visited - no point hitting these endpoints on every other route.
  useEffect(() => {
    if (!isFeedPage) return;
    let isCurrentRequest = true;

    async function loadSidebarData() {
      try {
        const [trendingResponse, connectionsResponse] = await Promise.all([
          apiClient.get<{ books: BackendTrendingBook[] }>('/feed/trending-books', { params: { limit: 5 } }),
          apiClient.get<{ readers: BackendSuggestedReader[] }>('/feed/connections', { params: { limit: 5 } }),
        ]);

        if (!isCurrentRequest) return;
        setIsDemoMode(false);
        setTrendingBooks(
          trendingResponse.data.books.map((book) => ({
            id: String(book.bookId),
            rank: book.rank,
            title: book.title,
            author: book.author,
          }))
        );
        setSuggestedReaders(
          connectionsResponse.data.readers.map((reader) => ({
            id: String(reader.userId),
            name: reader.name,
            username: reader.username,
            avatarUrl: resolveMediaUrl(reader.profilePicture),
            reviewCount: reader.reviewCount,
            // /feed/connections only ever returns people the viewer doesn't
            // already follow, so this always starts false.
            isFollowing: false,
          }))
        );
      } catch (error) {
        if (!isCurrentRequest) return;
        if (isBackendUnreachable(error)) {
          setTrendingBooks(MOCK_TRENDING_BOOKS);
          setSuggestedReaders(MOCK_SUGGESTED_READERS);
          setIsDemoMode(true);
        } else {
          // A real server error here isn't worth interrupting the feed
          // page over - the widgets just stay empty.
          setTrendingBooks([]);
          setSuggestedReaders([]);
        }
      }
      apiClient.get<{ recommendations: DiscoverRecommendation[] }>('/discover', { params: { limit: 1 } })
        .then((res) => {
          const top = res.data.recommendations[0];
          if (top) {
            setAiPick({
              id: String(top.bookId),
              title: top.title,
              author: top.author,
              coverImage: top.coverImage,
              reasonLabel: top.reasonLabel,
              reasonText: top.reasonText,
            });
          }
        })
        .catch(() => setAiPick(MOCK_AI_PICK)); // same fallback pattern as trending/connections
    }

    void loadSidebarData();
    return () => {
      isCurrentRequest = false;
    };
  }, [isFeedPage]);

  const handleToggleFollow = async (reader: SuggestedReader) => {
    if (isDemoMode) return; // nothing to persist in demo mode
    if (reader.isFollowing) {
      await apiClient.delete(`/users/${encodeURIComponent(reader.username)}/follow`);
    } else {
      await apiClient.post(`/users/${encodeURIComponent(reader.username)}/follow`);
    }
  };

  const sidebarWidgets = (
    <>
      <AiPickCard pick={aiPick} />
      {trendingBooks.length > 0 && <TrendingCard books={trendingBooks} />}
      {suggestedReaders.length > 0 && (
        <ReadersToFollowCard readers={suggestedReaders} onToggleFollow={handleToggleFollow} />
      )}
    </>
  );

  return (
    <div className="relative min-h-screen bg-background dark:bg-background-dark flex flex-col lg:flex-row w-full transition-colors duration-200">
      {/* Mobile Header Bar (Visible when minimized or on smaller displays) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-card px-4 py-3 dark:border-gray-800 dark:bg-card-dark lg:hidden">
        <Link to="/feed" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white">
            <BookOpenIcon className="h-4 w-4" />
          </span>
          <span className="text-base font-bold text-text dark:text-text-dark">Readify</span>
        </Link>
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open sidebar menu"
          className="rounded-xl p-2 text-textSecondary hover:bg-gray-100 dark:text-textSecondary-dark dark:hover:bg-gray-800"
        >
          <MenuIcon className="h-6 w-6" />
        </button>
      </header>

      {/* Left Sidebar */}
      <Sidebar mobileOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 px-4 py-6 sm:px-8 sm:py-8 max-w-4xl mx-auto w-full">
        {children}

        {isFeedPage && <section className="mt-8 space-y-6 xl:hidden">{sidebarWidgets}</section>}
      </main>

      {/* Right Sidebar Widgets - Visible ONLY on the Feed page */}
      {isFeedPage && (
        <aside className="hidden xl:block w-80 p-6 space-y-6 sticky top-0 h-screen overflow-y-auto scrollbar-hide border-l border-gray-100 dark:border-gray-800 shrink-0">
          {sidebarWidgets}
        </aside>
      )}
    </div>
  );
}

export default DashboardLayout;