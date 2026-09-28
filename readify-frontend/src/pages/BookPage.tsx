import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import apiClient from '../lib/api';
import { StarRating } from '../components/ui/StarRating';
import { Avatar } from '../components/ui/Avatar';
import { getBookById } from '../lib/mockBookData';
import { formatRelativeTime } from '../lib/formatRelativeTime';
import { ArrowLeftIcon, BookmarkIcon, BrainIcon, ChevronRightIcon } from '../components/icons';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') ?? 'http://localhost:4000';

function resolveMediaUrl(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    return `${API_BASE}${url}`;
}

/**
 * True only when the backend itself couldn't be reached (down, CORS, timeout)
 * - as opposed to a real response like a 404. Same reasoning as ProfilePage.
 */
function isBackendUnreachable(error: unknown): boolean {
    if (isAxiosError(error)) return !error.response;
    return false;
}

interface BackendBook {
    bookId: number;
    title: string;
    author: string;
    genre: string | null;
    publishedDate: string | null;
    coverImage: string | null;
    rating: number | null;
    noOfRatings: number;
    source: 'catalog' | 'user_submitted';
}

interface BackendBookReview {
    reviewId: number;
    rating: number;
    review: string;
    createdAt: string;
    reviewer: { userId: number; name: string; username: string; profilePicture: string | null };
}

// A single shape the JSX below renders from, whichever source (the real API,
// or local demo data when the backend is unreachable) it came from.
interface BookViewModel {
    bookId?: number; // only present for a real book - needed to call the shelf API
    title: string;
    author: string;
    genre?: string | null;
    coverUrl?: string;
    coverColor?: string;
    averageRating: number;
    noOfRatings?: number;
    publishedYear?: number;
    // These three come from a recommendation engine and only exist in local
    // demo data for now - the backend doesn't produce them yet, so they're
    // simply omitted (rather than faked) for real books.
    description?: string;
    recommendationReason?: string;
    matchPercent?: number;
    similarBooks: { id: string; title: string; coverColor?: string; coverUrl?: string }[];
}

interface ReviewViewModel {
    id: string;
    reviewerName: string;
    reviewerUsername?: string;
    reviewerAvatarUrl?: string;
    rating: number;
    content: string;
    createdAt: string;
}

function toBookViewModel(book: BackendBook): BookViewModel {
    return {
        bookId: book.bookId,
        title: book.title,
        author: book.author,
        genre: book.genre,
        coverUrl: resolveMediaUrl(book.coverImage),
        averageRating: book.rating ?? 0,
        noOfRatings: book.noOfRatings,
        publishedYear: book.publishedDate ? new Date(book.publishedDate).getFullYear() : undefined,
        similarBooks: [],
    };
}

function toReviewViewModel(review: BackendBookReview): ReviewViewModel {
    return {
        id: String(review.reviewId),
        reviewerName: review.reviewer.name,
        reviewerUsername: review.reviewer.username,
        reviewerAvatarUrl: resolveMediaUrl(review.reviewer.profilePicture),
        // This is the reviewer's own given rating, not the book's average.
        rating: review.rating,
        content: review.review,
        createdAt: review.createdAt,
    };
}

const DEMO_BOOK_ID = 'book-ttt';

export default function BookPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const bookId = searchParams.get('id') ?? '';

    const [book, setBook] = useState<BookViewModel | null>(null);
    const [reviews, setReviews] = useState<ReviewViewModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [isSavingToShelf, setIsSavingToShelf] = useState(false);
    const [savedToShelf, setSavedToShelf] = useState(false);

    const handleGoBack = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/feed');
        }
    };

    useEffect(() => {
        let isCurrentRequest = true;

        async function loadBook() {
            setIsLoading(true);
            setNotFound(false);
            setLoadError('');
            setIsDemoMode(false);
            setSavedToShelf(false);

            if (!bookId) {
                setNotFound(true);
                setIsLoading(false);
                return;
            }

            try {
                const [bookResponse, reviewsResponse] = await Promise.all([
                    apiClient.get<{ book: BackendBook }>(`/books/${encodeURIComponent(bookId)}`),
                    apiClient.get<{ reviews: BackendBookReview[] }>(`/books/${encodeURIComponent(bookId)}/reviews`, {
                        params: { limit: 20, offset: 0 },
                    }),
                ]);

                if (!isCurrentRequest) return;
                setBook(toBookViewModel(bookResponse.data.book));
                setReviews(reviewsResponse.data.reviews.map(toReviewViewModel));
            } catch (error) {
                if (!isCurrentRequest) return;

                if (isBackendUnreachable(error)) {
                    // Backend isn't running/reachable - fall back to local demo data
                    // instead of showing an error, same pattern as ProfilePage.
                    const demo = getBookById(DEMO_BOOK_ID);
                    if (demo) {
                        setBook({
                            title: demo.title,
                            author: demo.author,
                            genre: demo.genre,
                            coverColor: demo.coverColor,
                            coverUrl: demo.coverUrl,
                            averageRating: demo.averageRating,
                            publishedYear: demo.publishedYear,
                            description: demo.description,
                            recommendationReason: demo.recommendationReason,
                            matchPercent: demo.matchPercent,
                            similarBooks: demo.similarBooks,
                        });
                        setReviews(
                            demo.reviews.map((r) => ({
                                id: r.id,
                                reviewerName: r.reviewerName,
                                reviewerAvatarUrl: r.reviewerAvatarUrl,
                                rating: r.rating,
                                content: r.content,
                                createdAt: r.createdAt,
                            }))
                        );
                    }
                    setIsDemoMode(true);
                } else if (isAxiosError(error) && error.response?.status === 404) {
                    setNotFound(true);
                } else {
                    // Real server error (500, etc) - keep showing the actual error
                    // instead of masking it with demo data.
                    setLoadError('Unable to load this book. Please try again.');
                }
            } finally {
                if (isCurrentRequest) setIsLoading(false);
            }
        }

        void loadBook();
        return () => {
            isCurrentRequest = false;
        };
    }, [bookId]);

    const handleAddToShelf = async () => {
        if (!book) return;

        if (isDemoMode || !book.bookId) {
            setSavedToShelf(true);
            toast.success(`Added ${book.title} to your shelf`);
            return;
        }

        setIsSavingToShelf(true);
        try {
            await apiClient.post('/users/me/shelf', { status: 'want-to-read', bookId: book.bookId });
            setSavedToShelf(true);
            toast.success(`Added ${book.title} to your shelf`);
        } catch (error) {
            if (isAxiosError(error) && error.response?.status === 401) {
                toast.error('Log in to add books to your shelf');
            } else {
                toast.error('Something went wrong adding this to your shelf');
            }
        } finally {
            setIsSavingToShelf(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background px-4 py-8">
                <div className="mx-auto max-w-4xl">
                    <p className="text-sm text-textSecondary">Loading book…</p>
                </div>
            </div>
        );
    }

    if (notFound || !book) {
        return (
            <div className="min-h-screen bg-background px-4 py-8">
                <div className="mx-auto max-w-3xl">
                    <button
                        type="button"
                        onClick={handleGoBack}
                        className="flex items-center gap-2 text-sm font-medium text-textSecondary hover:text-text"
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        Back
                    </button>
                    <div className="mt-10 rounded-2xl border border-dashed border-gray-200 bg-card p-10 text-center">
                        <p className="text-sm font-medium text-text">We don't have this book yet</p>
                        <p className="mt-1 text-sm text-textSecondary">It may not exist, or hasn't synced from the backend.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-background px-4 py-8">
                <div className="mx-auto max-w-3xl">
                    <button
                        type="button"
                        onClick={handleGoBack}
                        className="flex items-center gap-2 text-sm font-medium text-textSecondary hover:text-text"
                    >
                        <ArrowLeftIcon className="h-4 w-4" />
                        Back
                    </button>
                    <div className="mt-10 rounded-2xl border border-dashed border-gray-200 bg-card p-10 text-center">
                        <p className="text-sm font-medium text-text">{loadError}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background px-4 py-8">
            <div className="mx-auto max-w-4xl">
                <button
                    type="button"
                    onClick={handleGoBack}
                    className="flex items-center gap-2 text-sm font-medium text-textSecondary hover:text-text"
                >
                    <ArrowLeftIcon className="h-4 w-4" />
                    Back
                </button>

                <div className="mt-6 grid gap-6 sm:gap-8 sm:grid-cols-[220px_1fr]">
                    <div>
                        {book.coverUrl ? (
                            <img src={book.coverUrl} alt={book.title} className="mx-auto h-64 w-full max-w-[200px] rounded-xl object-cover shadow-sm sm:h-72 sm:max-w-none" />
                        ) : (
                            <div
                                className="mx-auto flex h-64 w-full max-w-[200px] items-center justify-center rounded-xl text-3xl sm:h-72 sm:max-w-none font-bold text-white shadow-sm"
                                style={{ backgroundColor: book.coverColor ?? '#5B5CEB' }}
                            >
                                {book.title.slice(0, 2).toUpperCase()}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={handleAddToShelf}
                            disabled={isSavingToShelf || savedToShelf}
                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            <BookmarkIcon className="h-4 w-4" filled={savedToShelf} />
                            {savedToShelf ? 'Added to Shelf' : isSavingToShelf ? 'Adding…' : 'Add to Shelf'}
                        </button>
                    </div>

                    <div>
                        {book.genre && (
                            <span className="inline-block rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-primary">
                                {book.genre}
                            </span>
                        )}

                        <h1 className="mt-3 break-words text-2xl font-bold text-text sm:text-3xl">{book.title}</h1>
                        <p className="mt-1 text-lg text-textSecondary">{book.author}</p>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-textSecondary">
                            <StarRating value={Math.round(book.averageRating)} />
                            <span className="font-semibold text-text">{book.averageRating.toFixed(1)}</span>
                            {typeof book.noOfRatings === 'number' && (
                                <span>
                                    ({book.noOfRatings} rating{book.noOfRatings === 1 ? '' : 's'})
                                </span>
                            )}
                            {book.publishedYear && (
                                <>
                                    <span>·</span>
                                    <span>{book.publishedYear}</span>
                                </>
                            )}
                        </div>

                        {book.recommendationReason && (
                            <button
                                type="button"
                                className="mt-4 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-card px-4 py-3 text-left shadow-sm transition-colors duration-150 hover:bg-gray-50"
                            >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                                    <BrainIcon className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-text">Why Readify recommends this</span>
                                    <span className="block truncate text-xs text-textSecondary">
                                        {book.recommendationReason}
                                        {book.matchPercent ? ` · ${book.matchPercent}% match` : ''}
                                    </span>
                                </span>
                                <ChevronRightIcon className="h-4 w-4 shrink-0 text-textSecondary" />
                            </button>
                        )}

                        {book.description && (
                            <>
                                <h2 className="mt-6 text-lg font-bold text-text">About this book</h2>
                                <p className="mt-2 text-sm leading-relaxed text-textSecondary">{book.description}</p>
                            </>
                        )}
                    </div>
                </div>

                <h2 className="mt-8 text-lg font-bold text-text">Community Reviews</h2>
                <div className="mt-3 space-y-3">
                    {reviews.length === 0 && (
                        <p className="text-sm text-textSecondary">No reviews yet — be the first to share your thoughts.</p>
                    )}
                    {reviews.map((review) => (
                        <div key={review.id} className="rounded-2xl border border-gray-100 bg-card p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                                <Avatar name={review.reviewerName} src={review.reviewerAvatarUrl} size="sm" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            {review.reviewerUsername ? (
                                                <Link
                                                    to={`/profile/${review.reviewerUsername}`}
                                                    className="text-sm font-semibold text-text hover:underline"
                                                >
                                                    {review.reviewerName}
                                                </Link>
                                            ) : (
                                                <span className="text-sm font-semibold text-text">{review.reviewerName}</span>
                                            )}
                                            {/* Read-only: this is the reviewer's own rating for this book, not
                                                something the viewer can edit here (see FeedItemCard for the same rule). */}
                                            <StarRating value={review.rating} />
                                        </div>
                                        <span className="text-xs text-textSecondary">{formatRelativeTime(review.createdAt)}</span>
                                    </div>
                                    <p className="mt-1.5 text-sm text-text">{review.content}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {book.similarBooks.length > 0 && (
                    <>
                        <h2 className="mt-8 text-lg font-bold text-text">Similar Books You Might Love</h2>
                        <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
                            {book.similarBooks.map((similar) => (
                                <Link key={similar.id} to={`/books?id=${similar.id}`} className="w-24 shrink-0">
                                    {similar.coverUrl ? (
                                        <img src={similar.coverUrl} alt={similar.title} className="h-32 w-24 rounded-lg object-cover" />
                                    ) : (
                                        <div
                                            className="flex h-32 w-24 items-center justify-center rounded-lg text-xs font-semibold text-white"
                                            style={{ backgroundColor: similar.coverColor ?? '#5B5CEB' }}
                                        >
                                            {similar.title.slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <p className="mt-1.5 truncate text-xs font-medium text-text hover:underline">{similar.title}</p>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}