import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { FeedItemCard } from '../components/feed/FeedItemCard';
import { NewEntryModal } from '../components/feed/NewEntryModal';
import { ArrowLeftIcon, PlusIcon } from '../components/icons';
import { Avatar } from '../components/ui/Avatar';
import type { CreateEntryPayload, FeedComment, FeedItem } from '../types/feed';
import { addCommentToTree } from '../lib/commentUtils';
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

type FollowState = 'self' | 'mutual' | 'following' | 'follower' | 'stranger';

interface ProfileResponse {
  user: BackendUser;
  isOwnProfile: boolean;
  relationship: 'self' | 'friend' | 'stranger';
  // Richer than `relationship` above (which only exists for the visibility
  // rules and collapses to 'stranger' for any one-sided follow). This is
  // what the profile header actually displays.
  followState: FollowState;
  viewerFollowsTarget: boolean;
  targetFollowsViewer: boolean;
  followersCount: number;
  followingCount: number;
  reviewsCount: number;
}

interface FollowListEntry {
  userId: number;
  name: string;
  username: string;
  profilePicture: string | null;
  isFollowedByViewer: boolean;
}

interface BackendPost {
  postId: number;
  caption: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'JUST_ME';
  createdAt: string;
  likeCount: number;
  likedByMe?: boolean;
  commentCount?: number;
  book: { bookId: number; title: string; author: string } | null;
}

interface BackendReview {
  reviewId: number;
  rating: number;
  review: string;
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
  commentCount?: number;
  book: { bookId: number; title: string; author: string; coverImage?: string | null; rating?: number };
}

interface BackendQuote {
  quoteId: number;
  quote: string;
  createdAt?: string;
  likeCount?: number;
  likedByMe?: boolean;
}

interface ProfileQuote {
  id: string;
  quote: string;
  likedByMe: boolean;
  likeCount: number;
}

interface BackendComment {
  commentId: number;
  parentCommentId: number | null;
  comment: string;
  createdAt: string;
  author: { userId: number; name: string; username: string; profilePicture: string | null };
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

function toFeedItem(post: BackendPost, profile: BackendUser): FeedItem {
  return {
    id: String(post.postId),
    type: 'post',
    author: {
      id: String(profile.userId),
      name: profile.name,
      username: profile.username,
      avatarUrl: resolveMediaUrl(profile.profilePicture),
    },
    book: post.book
      ? { id: String(post.book.bookId), title: post.book.title, author: post.book.author, rating: 0 }
      : undefined,
    content: post.caption,
    createdAt: post.createdAt,
    visibility: post.visibility === 'JUST_ME' ? 'only_me' : (post.visibility.toLowerCase() as 'public' | 'private'),
    likeCount: post.likeCount,
    commentCount: post.commentCount ?? 0,
    repostCount: 0,
    likedByMe: post.likedByMe ?? false,
    bookmarkedByMe: false,
    repostedByMe: false,
    comments: [],
  };
}

function toReviewFeedItem(review: BackendReview, profile: BackendUser): FeedItem {
  return {
    id: `review-${review.reviewId}`,
    type: 'review',
    author: {
      id: String(profile.userId),
      name: profile.name,
      username: profile.username,
      avatarUrl: resolveMediaUrl(profile.profilePicture),
    },
    book: {
      id: String(review.book.bookId),
      title: review.book.title,
      author: review.book.author,
      coverUrl: resolveMediaUrl(review.book.coverImage),
      // The book's average rating (from the books table), not this reviewer's rating.
      rating: review.book.rating ?? review.rating,
    },
    userRating: review.rating,
    content: review.review,
    createdAt: review.createdAt,
    visibility: 'public',
    likeCount: review.likeCount ?? 0,
    commentCount: review.commentCount ?? 0,
    repostCount: 0,
    likedByMe: review.likedByMe ?? false,
    bookmarkedByMe: false,
    repostedByMe: false,
    comments: [],
  };
}

// ---------------------------------------------------------------------------
// Demo data: shown when the backend is unreachable (network/connection error),
// so the page still renders something meaningful instead of a blank error.
// This is local-only — nothing here is ever persisted to a server.
// Done so that frontend can be viewed and changed without the need of server.
// ---------------------------------------------------------------------------

const DEMO_USER: BackendUser = {
  userId: 0,
  name: 'Jordan Rivera',
  username: 'jordan.reads',
  profilePicture: null,
  bio: 'Fantasy & sci-fi enthusiast 📚 Currently reading through the Cosmere.',
};

const DEMO_PROFILE: ProfileResponse = {
  user: DEMO_USER,
  isOwnProfile: true,
  relationship: 'self',
  followState: 'self',
  viewerFollowsTarget: false,
  targetFollowsViewer: false,
  followersCount: 128,
  followingCount: 94,
  reviewsCount: 1,
};

const DEMO_POSTS: FeedItem[] = [
  {
    id: 'demo-2',
    type: 'post',
    author: { id: '0', name: DEMO_USER.name, username: DEMO_USER.username, avatarUrl: undefined },
    book: undefined,
    content: 'Starting a new series this weekend, taking recommendations!',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    visibility: 'public',
    likeCount: 9,
    commentCount: 0,
    repostCount: 0,
    likedByMe: false,
    bookmarkedByMe: false,
    repostedByMe: false,
    comments: [],
  },
];

const DEMO_REVIEWS: FeedItem[] = [
  {
    id: 'demo-1',
    type: 'review',
    author: { id: '0', name: DEMO_USER.name, username: DEMO_USER.username, avatarUrl: undefined },
    book: { id: 'demo-book-1', title: 'The Way of Kings', author: 'Brandon Sanderson', rating: 5 },
    userRating: 5,
    content: "An absolute masterclass in worldbuilding. Couldn't put it down.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    visibility: 'public',
    likeCount: 24,
    commentCount: 0,
    repostCount: 2,
    likedByMe: false,
    bookmarkedByMe: false,
    repostedByMe: false,
    comments: [],
  },
];

const DEMO_QUOTES: string[] = [
  'Life before death, strength before weakness, journey before destination.',
  'It is our choices that show what we truly are, far more than our abilities.',
];

/**
 * True when a request failed because the backend couldn't be reached at all
 * (connection refused, DNS failure, timeout, CORS, etc) — as opposed to a
 * real server response like a 404 "user not found" or a 401.
 */
function isBackendUnreachable(error: unknown): boolean {
  if (isAxiosError(error)) {
    // No response means the request never made it to a server.
    return !error.response;
  }
  return false;
}

// Follows only one way ("A follows B but B doesn't follow A") reads as a
// one-sided relation instead of lumping it in with true strangers.
function getFollowStateLabel(state: FollowState): string {
  switch (state) {
    case 'mutual':
      return 'Mutual';
    case 'following':
    case 'follower':
      return 'One-sided relation';
    case 'stranger':
      return 'Stranger';
    default:
      return '';
  }
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { username: viewedUsername } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [viewer, setViewer] = useState<BackendUser | null>(null);
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [reviews, setReviews] = useState<FeedItem[]>([]);
  const [activeContentTab, setActiveContentTab] = useState<'posts' | 'reviews'>('posts');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [entryModalMode, setEntryModalMode] = useState<'post' | 'review'>('post');
  const [quotes, setQuotes] = useState<ProfileQuote[]>([]);
  const [quoteDraft, setQuoteDraft] = useState('');
  const [isAddingQuote, setIsAddingQuote] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeProfileEditor, setActiveProfileEditor] = useState<'bio' | 'photo' | null>(null);
  const [bioDraft, setBioDraft] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [activeModal, setActiveModal] = useState<'followers' | 'following' | null>(null);
  const [followListEntries, setFollowListEntries] = useState<FollowListEntry[]>([]);
  const [isLoadingFollowList, setIsLoadingFollowList] = useState(false);
  const [followListError, setFollowListError] = useState('');

  // Photo editor state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      toast.error('Only JPEG, PNG, WEBP, or GIF images are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    let isCurrentRequest = true;

    async function loadProfile() {
      setIsLoading(true);
      setLoadError('');
      setIsDemoMode(false);
      try {
        const viewerResponse = await apiClient.get<{ user: BackendUser }>('/auth/me');
        const currentViewer = viewerResponse.data.user;
        const username = viewedUsername ?? currentViewer.username;
        const [profileResponse, postsResponse, reviewsResponse, quotesResponse] = await Promise.all([
          apiClient.get<ProfileResponse>(`/users/${encodeURIComponent(username)}`),
          apiClient.get<{ posts: BackendPost[] }>(`/users/${encodeURIComponent(username)}/posts`, {
            params: { limit: 30, offset: 0 },
          }),
          apiClient.get<{ reviews: BackendReview[] }>(`/users/${encodeURIComponent(username)}/reviews`, {
            params: { limit: 30, offset: 0 },
          }),
          apiClient.get<{ quotes: BackendQuote[] }>(`/users/${encodeURIComponent(username)}/quotes`, {
            params: { limit: 20 },
          }),
        ]);

        if (!isCurrentRequest) return;
        setViewer(currentViewer);
        setProfile(profileResponse.data);
        setPosts(postsResponse.data.posts.map((post) => toFeedItem(post, profileResponse.data.user)));
        setReviews(reviewsResponse.data.reviews.map((review) => toReviewFeedItem(review, profileResponse.data.user)));
        // User 0 (Readify AI) only ever shows reviews - no posts tab for it.
        setActiveContentTab(profileResponse.data.user.userId === 0 ? 'reviews' : 'posts');
        setQuotes(
          quotesResponse.data.quotes.map((quote) => ({
            id: String(quote.quoteId),
            quote: quote.quote,
            likedByMe: quote.likedByMe ?? false,
            likeCount: quote.likeCount ?? 0,
          }))
        );
        setIsFollowing(profileResponse.data.viewerFollowsTarget);
        setBioDraft(profileResponse.data.user.bio ?? '');
      } catch (error) {
        if (!isCurrentRequest) return;

        if (isBackendUnreachable(error)) {
          // Backend isn't running/reachable — fall back to local demo data
          // instead of showing an error, so the page still demonstrates the UI.
          setViewer(DEMO_USER);
          setProfile(DEMO_PROFILE);
          setPosts(DEMO_POSTS);
          setReviews(DEMO_REVIEWS);
          setActiveContentTab('posts');
          setQuotes(
            DEMO_QUOTES.map((quote, index) => ({
              id: `demo-quote-${index}`,
              quote,
              likedByMe: false,
              likeCount: 0,
            }))
          );
          setIsFollowing(false);
          setBioDraft(DEMO_USER.bio ?? '');
          setIsDemoMode(true);
        } else {
          // Real server error (e.g. 404 user not found, 401, 500) — keep
          // showing the actual error instead of masking it with demo data.
          setLoadError('Unable to load this profile. Please try again.');
          setProfile(null);
          setPosts([]);
          setReviews([]);
          setQuotes([]);
        }
      } finally {
        if (isCurrentRequest) setIsLoading(false);
      }
    }

    void loadProfile();
    return () => {
      isCurrentRequest = false;
    };
  }, [viewedUsername]);

  const currentUserName = viewer?.name ?? profile?.user.name ?? '';
  const isOwnProfile = profile?.isOwnProfile ?? false;
  // Quotes are visible to the owner and to friends (mutual follows) - never
  // to strangers - so the panel (and the 3-column layout it needs) shows
  // for both, not just isOwnProfile.
  const showQuotesPanel = isOwnProfile || profile?.relationship === 'friend';
  const shouldShowFollowStats = Boolean(profile && profile.user.userId !== 0);

  // Save bio only
  const handleSaveBio = async (event: FormEvent) => {
    event.preventDefault();
    if (!isOwnProfile || isSavingProfile) return;

    if (isDemoMode) {
      // No backend to persist to — just update local state.
      setProfile((current) => (current ? { ...current, user: { ...current.user, bio: bioDraft } } : current));
      setActiveProfileEditor(null);
      toast.success('Bio updated (demo mode — not saved to a server)');
      return;
    }

    setIsSavingProfile(true);
    try {
      const formData = new FormData();
      formData.append('bio', bioDraft);
      const response = await apiClient.patch<{ user: BackendUser }>('/users/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile((current) => (current ? { ...current, user: response.data.user } : current));
      setBioDraft(response.data.user.bio ?? '');
      setActiveProfileEditor(null);
      toast.success('Bio updated!');
    } catch {
      toast.error('Unable to update bio. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Save profile picture only
  const handleSavePhoto = async (event: FormEvent) => {
    event.preventDefault();
    if (!isOwnProfile || isSavingProfile || !photoFile) return;

    if (isDemoMode) {
      // No backend to persist to — just update local state with the local preview URL.
      setProfile((current) =>
        current ? { ...current, user: { ...current.user, profilePicture: photoPreview } } : current
      );
      setViewer((current) => (current ? { ...current, profilePicture: photoPreview } : current));
      setPhotoFile(null);
      setActiveProfileEditor(null);
      toast.success('Profile photo updated (demo mode — not saved to a server)');
      return;
    }

    setIsSavingProfile(true);
    try {
      const formData = new FormData();
      formData.append('profilePicture', photoFile);
      const response = await apiClient.patch<{ user: BackendUser }>('/users/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProfile((current) => (current ? { ...current, user: response.data.user } : current));
      setViewer((current) => (current ? { ...current, profilePicture: response.data.user.profilePicture } : current));
      setPhotoFile(null);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
      setActiveProfileEditor(null);
      toast.success('Profile photo updated!');
    } catch {
      toast.error('Unable to update profile photo. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!isOwnProfile) return;

    const isReview = reviews.some((item) => item.id === id);
    const isPost = !isReview && posts.some((item) => item.id === id);
    if (!isReview && !isPost) return;

    if (!isDemoMode) {
      try {
        if (isReview) {
          const reviewId = id.replace(/^review-/, '');
          await apiClient.delete(`/reviews/${reviewId}`);
        } else {
          await apiClient.delete(`/posts/${id}`);
        }
      } catch {
        toast.error('Unable to delete. Please try again.');
        return;
      }
    }

    if (isReview) {
      setReviews((current) => current.filter((item) => item.id !== id));
      toast.success('Review removed from profile');
    } else {
      setPosts((current) => current.filter((item) => item.id !== id));
      toast.success('Post removed from profile');
    }
  };

  const handleToggleFollow = async () => {
    if (!profile || profile.user.userId === 0 || profile.isOwnProfile) return;

    if (isDemoMode) {
      setIsFollowing((current) => {
        const nextValue = !current;
        toast.success(nextValue ? 'Following' : 'Unfollowed');
        return nextValue;
      });
      return;
    }

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    try {
      const response = wasFollowing
        ? await apiClient.delete<{ following: boolean; followersCount: number }>(
            `/users/${encodeURIComponent(profile.user.username)}/follow`
          )
        : await apiClient.post<{ following: boolean; followersCount: number }>(
            `/users/${encodeURIComponent(profile.user.username)}/follow`
          );
      setIsFollowing(response.data.following);
      setProfile((current) =>
        current
          ? {
              ...current,
              followersCount: response.data.followersCount,
              viewerFollowsTarget: response.data.following,
              followState: response.data.following
                ? current.targetFollowsViewer
                  ? 'mutual'
                  : 'following'
                : current.targetFollowsViewer
                  ? 'follower'
                  : 'stranger',
            }
          : current
      );
      toast.success(response.data.following ? 'Following' : 'Unfollowed');
    } catch {
      setIsFollowing(wasFollowing);
      toast.error('Unable to update follow status. Please try again.');
    }
  };

  // Loads the followers/following list whenever the panel is opened, and
  // locks background scroll while it's open ("don't let the outside be
  // scrollable") - the list itself is the only scrollable region.
  useEffect(() => {
    if (!activeModal) {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.overflow = 'hidden';

    if (isDemoMode || !profile) {
      setFollowListEntries([]);
      setFollowListError('');
      setIsLoadingFollowList(false);
      return () => {
        document.body.style.overflow = '';
      };
    }

    let isCurrent = true;
    setIsLoadingFollowList(true);
    setFollowListError('');

    const endpoint = activeModal === 'followers' ? 'followers' : 'following';
    apiClient
      .get<{ followers?: FollowListEntry[]; following?: FollowListEntry[] }>(
        `/users/${encodeURIComponent(profile.user.username)}/${endpoint}`,
        { params: { limit: 50, offset: 0 } }
      )
      .then((response) => {
        if (!isCurrent) return;
        setFollowListEntries(response.data.followers ?? response.data.following ?? []);
      })
      .catch(() => {
        if (!isCurrent) return;
        setFollowListError('Unable to load this list. Please try again.');
      })
      .finally(() => {
        if (isCurrent) setIsLoadingFollowList(false);
      });

    return () => {
      isCurrent = false;
      document.body.style.overflow = '';
    };
  }, [activeModal, isDemoMode, profile]);

  // "Remove follower" - only available on your own profile's Followers list.
  const handleRemoveFollower = async (entry: FollowListEntry) => {
    if (isDemoMode) {
      setFollowListEntries((current) => current.filter((e) => e.userId !== entry.userId));
      setProfile((current) => (current ? { ...current, followersCount: Math.max(current.followersCount - 1, 0) } : current));
      toast.success(`Removed ${entry.name} (demo mode — not saved to a server)`);
      return;
    }

    try {
      const response = await apiClient.delete<{ removed: boolean; followersCount: number }>(
        `/users/me/followers/${encodeURIComponent(entry.username)}`
      );
      setFollowListEntries((current) => current.filter((e) => e.userId !== entry.userId));
      setProfile((current) => (current ? { ...current, followersCount: response.data.followersCount } : current));
      toast.success(`Removed ${entry.name} from your followers`);
    } catch {
      toast.error('Unable to remove this follower. Please try again.');
    }
  };

  // "Remove following" - unfollowing someone directly from the Following list.
  const handleRemoveFollowing = async (entry: FollowListEntry) => {
    if (isDemoMode) {
      setFollowListEntries((current) => current.filter((e) => e.userId !== entry.userId));
      setProfile((current) => (current ? { ...current, followingCount: Math.max(current.followingCount - 1, 0) } : current));
      toast.success(`Unfollowed ${entry.name} (demo mode — not saved to a server)`);
      return;
    }

    try {
      await apiClient.delete(`/users/${encodeURIComponent(entry.username)}/follow`);
      setFollowListEntries((current) => current.filter((e) => e.userId !== entry.userId));
      setProfile((current) => (current ? { ...current, followingCount: Math.max(current.followingCount - 1, 0) } : current));
      toast.success(`Unfollowed ${entry.name}`);
    } catch {
      toast.error('Unable to unfollow this user. Please try again.');
    }
  };

  const handleToggleLike = async (id: string) => {
    const isReview = id.startsWith('review-');
    const targetId = isReview ? id.replace(/^review-/, '') : id;
    const list = isReview ? reviews : posts;
    const setList = isReview ? setReviews : setPosts;
    const item = list.find((i) => i.id === id);
    if (!item) return;

    const wasLiked = item.likedByMe;
    const previousCount = item.likeCount;

    // Optimistic update - reflected immediately, then reconciled (or rolled
    // back) once the request settles.
    setList((current) =>
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

      setList((current) =>
        current.map((i) =>
          i.id === id ? { ...i, likeCount: response.data.likeCount, likedByMe: response.data.likedByMe } : i
        )
      );
    } catch {
      setList((current) =>
        current.map((i) => (i.id === id ? { ...i, likedByMe: wasLiked, likeCount: previousCount } : i))
      );
      toast.error('Unable to update like. Please try again.');
    }
  };

  // Fetches the full comment thread for a post/review the first time its
  // comment section is opened - the posts/reviews list endpoints only send
  // back a commentCount, not the comments themselves.
  const [loadedCommentItemIds, setLoadedCommentItemIds] = useState<Set<string>>(new Set());

  const handleOpenComments = async (itemId: string) => {
    if (isDemoMode || loadedCommentItemIds.has(itemId)) return;

    const isReview = itemId.startsWith('review-');
    const targetId = isReview ? itemId.replace(/^review-/, '') : itemId;
    const setList = isReview ? setReviews : setPosts;

    try {
      const response = await apiClient.get<{ comments: BackendComment[] }>(
        `/${isReview ? 'reviews' : 'posts'}/${targetId}/comments`
      );
      const tree = buildCommentTree(response.data.comments);
      setList((current) => current.map((item) => (item.id === itemId ? { ...item, comments: tree } : item)));
      setLoadedCommentItemIds((current) => new Set(current).add(itemId));
    } catch {
      // A failed background comment fetch isn't worth interrupting the user
      // with a toast - the section just stays empty until they retry.
    }
  };

  // Bookmarking only applies to reviews (see FeedItemCard - the button is
  // hidden entirely for posts) and means "save this book to my wishlist"
  // rather than a generic bookmark.
  const handleToggleBookmark = async (id: string) => {
    const item = reviews.find((review) => review.id === id);
    if (!item || item.type !== 'review' || !item.book) return;

    if (item.bookmarkedByMe) {
      // Already saved - nothing to undo server-side for now, just reflect it.
      return;
    }

    setReviews((current) =>
      current.map((review) => (review.id === id ? { ...review, bookmarkedByMe: true } : review))
    );

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
      setReviews((current) =>
        current.map((review) => (review.id === id ? { ...review, bookmarkedByMe: false } : review))
      );
      toast.error('Unable to save this book. Please try again.');
    }
  };

  const handleAddComment = async (itemId: string, parentCommentId: string | null, content: string) => {
    const isReview = itemId.startsWith('review-');
    const targetId = isReview ? itemId.replace(/^review-/, '') : itemId;
    const setList = isReview ? setReviews : setPosts;

    if (isDemoMode) {
      const newComment: FeedComment = {
        id: `comment-${Date.now()}`,
        author: { id: String(viewer?.userId ?? ''), name: currentUserName, username: viewer?.username ?? '' },
        content,
        createdAt: new Date().toISOString(),
        replies: [],
      };
      setList((current) =>
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
      setList((current) =>
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
    if (!viewer || !isOwnProfile) return;

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
      if (payload.isReview) {
        setReviews((current) => [newItem, ...current]);
      } else {
        setPosts((current) => [newItem, ...current]);
      }
      toast.success(`${payload.isReview ? 'Review' : 'Post'} published (demo mode — not saved to a server)`);
      return;
    }

    try {
      if (payload.isReview) {
        const response = await apiClient.post<{ review: BackendReview }>('/reviews', {
          rating: payload.rating,
          review: payload.content,
          // If the user picked a suggestion, send its bookId so the backend
          // reuses that exact book instead of matching by title+author.
          ...(payload.bookId
            ? { bookId: Number(payload.bookId) }
            : { title: payload.bookTitle, author: payload.bookAuthor }),
        });
        setReviews((current) => [toReviewFeedItem(response.data.review, profile!.user), ...current]);
        toast.success('Review published!');
      } else {
        const response = await apiClient.post<{ post: BackendPost }>('/posts', {
          caption: payload.content,
          visibility: payload.visibility === 'only_me' ? 'JUST_ME' : payload.visibility.toUpperCase(),
        });
        setPosts((current) => [toFeedItem(response.data.post, profile!.user), ...current]);
        toast.success('Posted!');
      }
    } catch {
      toast.error(`Unable to publish this ${payload.isReview ? 'review' : 'post'}. Please try again.`);
    }
  };

  const handleDeleteQuote = async (id: string) => {
    if (isDemoMode) {
      setQuotes((current) => current.filter((quote) => quote.id !== id));
      toast.success('Quote removed');
      return;
    }
    try {
      await apiClient.delete(`/quotes/${id}`);
      setQuotes((current) => current.filter((quote) => quote.id !== id));
      toast.success('Quote removed');
    } catch {
      toast.error('Unable to remove quote. Please try again.');
    }
  };

  const handleToggleQuoteLike = async (id: string) => {
    const quote = quotes.find((q) => q.id === id);
    if (!quote) return;

    const wasLiked = quote.likedByMe;
    const previousCount = quote.likeCount;

    setQuotes((current) =>
      current.map((q) =>
        q.id === id ? { ...q, likedByMe: !wasLiked, likeCount: wasLiked ? q.likeCount - 1 : q.likeCount + 1 } : q
      )
    );

    if (isDemoMode) return;

    try {
      const response = wasLiked
        ? await apiClient.delete<{ likeCount: number; likedByMe: boolean }>(`/quotes/${id}/like`)
        : await apiClient.post<{ likeCount: number; likedByMe: boolean }>(`/quotes/${id}/like`);
      setQuotes((current) =>
        current.map((q) => (q.id === id ? { ...q, likeCount: response.data.likeCount, likedByMe: response.data.likedByMe } : q))
      );
    } catch {
      setQuotes((current) =>
        current.map((q) => (q.id === id ? { ...q, likedByMe: wasLiked, likeCount: previousCount } : q))
      );
      toast.error('Unable to update like. Please try again.');
    }
  };

  const handleAddQuote = async (event: FormEvent) => {
    event.preventDefault();
    const text = quoteDraft.trim();
    if (!text || isAddingQuote) return;

    if (isDemoMode) {
      setQuotes((current) => [{ id: `demo-quote-${Date.now()}`, quote: text, likedByMe: false, likeCount: 0 }, ...current]);
      setQuoteDraft('');
      toast.success('Quote added (demo mode — not saved to a server)');
      return;
    }

    setIsAddingQuote(true);
    try {
      const response = await apiClient.post<{ quote: BackendQuote }>('/quotes', { quote: text });
      setQuotes((current) => [
        { id: String(response.data.quote.quoteId), quote: response.data.quote.quote, likedByMe: false, likeCount: 0 },
        ...current,
      ]);
      setQuoteDraft('');
      toast.success('Quote added!');
    } catch {
      toast.error('Unable to add quote. Please try again.');
    } finally {
      setIsAddingQuote(false);
    }
  };

  return (
    <div className="w-full space-y-8 pb-12">
      {viewedUsername && (
        <div>
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/feed');
              }
            }}
            className="inline-flex items-center gap-2 text-sm font-medium text-textSecondary dark:text-textSecondary-dark hover:text-text dark:hover:text-text-dark transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </button>
        </div>
      )}
      {isLoading && <p className="text-sm text-textSecondary">Loading profile...</p>}
      {!isLoading && loadError && <p className="text-sm text-error">{loadError}</p>}
      {!isLoading && !profile && !loadError && <p className="text-sm text-textSecondary">Profile not found.</p>}

      {!isLoading && profile && (
        <>
          {isDemoMode && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
              Showing demo data — the backend isn't reachable right now. Changes here won't be saved.
            </div>
          )}

          {/* Profile Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6 rounded-2xl border border-gray-100 dark:border-gray-800 bg-card dark:bg-card-dark p-4 sm:p-6 shadow-sm">
            <Avatar
              name={profile.user.name}
              src={photoPreview ?? resolveMediaUrl(profile.user.profilePicture)}
              size="lg"
              className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 border-2 border-white text-2xl shadow-md"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="break-words text-2xl font-bold text-text dark:text-text-dark">{profile.user.name}</h1>
                {isOwnProfile && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveProfileEditor((current) => (current === 'photo' ? null : 'photo'))}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-textSecondary dark:text-textSecondary-dark hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {activeProfileEditor === 'photo' ? 'Cancel photo' : 'Change photo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveProfileEditor((current) => (current === 'bio' ? null : 'bio'))}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-textSecondary dark:text-textSecondary-dark hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {activeProfileEditor === 'bio' ? 'Cancel bio' : 'Edit bio'}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-textSecondary dark:text-textSecondary-dark">@{profile.user.username}</p>
              {isOwnProfile && activeProfileEditor === 'photo' && (
                <form onSubmit={handleSavePhoto} className="max-w-lg space-y-3 pt-1">
                  {/* Hidden native file input */}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handlePhotoFileChange}
                  />

                  {/* Preview + pick button */}
                  <div className="flex items-center gap-4">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Preview"
                        className="h-16 w-16 rounded-full object-cover border-2 border-primary"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-textSecondary dark:text-textSecondary-dark text-xs">
                        No file
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-textSecondary dark:text-textSecondary-dark hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {photoFile ? 'Choose different file' : 'Choose file…'}
                    </button>
                  </div>

                  {photoFile && (
                    <p className="text-xs text-textSecondary dark:text-textSecondary-dark">
                      {photoFile.name} · {(photoFile.size / 1024).toFixed(0)} KB
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSavingProfile || !photoFile}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingProfile ? 'Saving...' : 'Save photo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveProfileEditor(null);
                        setPhotoFile(null);
                        if (photoPreview) URL.revokeObjectURL(photoPreview);
                        setPhotoPreview(null);
                      }}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-textSecondary dark:text-textSecondary-dark hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {isOwnProfile && activeProfileEditor === 'bio' && (
                <form onSubmit={handleSaveBio} className="max-w-lg space-y-2 pt-1">
                  <textarea
                    value={bioDraft}
                    onChange={(event) => setBioDraft(event.target.value)}
                    maxLength={500}
                    placeholder="Tell readers about yourself..."
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-text dark:text-text-dark focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingProfile ? 'Saving...' : 'Save bio'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveProfileEditor(null)}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-textSecondary dark:text-textSecondary-dark hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
              {!activeProfileEditor && (
                <p className="pt-1 text-sm leading-relaxed text-text dark:text-text-dark max-w-lg">
                  {profile.user.bio?.trim() ? profile.user.bio : 'No bio available right now.'}
                </p>
              )}
              {!profile.isOwnProfile && (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <p className="text-xs font-medium text-primary">{getFollowStateLabel(profile.followState)}</p>
                  {shouldShowFollowStats && (
                    <button
                      type="button"
                      onClick={handleToggleFollow}
                      className="rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              )}
              {shouldShowFollowStats && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-3 text-sm sm:gap-x-8">
                  <button
                    type="button"
                    onClick={() => setActiveModal('followers')}
                    className="hover:opacity-80 transition-opacity text-left"
                  >
                    <span className="font-bold text-text dark:text-text-dark">{profile.followersCount}</span>{' '}
                    <span className="text-textSecondary dark:text-textSecondary-dark">Followers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal('following')}
                    className="hover:opacity-80 transition-opacity text-left"
                  >
                    <span className="font-bold text-text dark:text-text-dark">{profile.followingCount}</span>{' '}
                    <span className="text-textSecondary dark:text-textSecondary-dark">Following</span>
                  </button>
                  <div>
                    <span className="font-bold text-text dark:text-text-dark">{posts.length}</span>{' '}
                    <span className="text-textSecondary dark:text-textSecondary-dark">Posts</span>
                  </div>
                </div>
              )}
              {!shouldShowFollowStats && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-3 text-sm sm:gap-x-8">
                  <div>
                    <span className="font-bold text-text dark:text-text-dark">{profile.reviewsCount}</span>{' '}
                    <span className="text-textSecondary dark:text-textSecondary-dark">
                      {profile.reviewsCount === 1 ? 'Review' : 'Reviews'}
                    </span>
                  </div>
                </div>
              )}
        </div>
      </div>

      {/* Main Layout Grid */}
      {/* Quotes have no visibility tiers of their own - unlike posts they're
          gated purely by relationship, so friends (not just the owner) get
          the same three-column layout with the Quotes panel visible. */}
      <div className={showQuotesPanel ? 'grid grid-cols-1 lg:grid-cols-3 gap-8 items-start' : 'grid grid-cols-1 gap-8 items-start'}>
        {/* Left: Posts / Reviews Section */}
        <div className={showQuotesPanel ? 'lg:col-span-2 space-y-6' : 'space-y-6'}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-5">
              {shouldShowFollowStats && (
                <button
                  type="button"
                  onClick={() => setActiveContentTab('posts')}
                  className={`pb-2 text-lg font-bold border-b-2 transition-colors ${
                    activeContentTab === 'posts'
                      ? 'border-primary text-text dark:text-text-dark'
                      : 'border-transparent text-textSecondary dark:text-textSecondary-dark hover:text-text dark:hover:text-text-dark'
                  }`}
                >
                  Posts
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveContentTab('reviews')}
                className={`pb-2 text-lg font-bold border-b-2 transition-colors ${
                  activeContentTab === 'reviews' || !shouldShowFollowStats
                    ? 'border-primary text-text dark:text-text-dark'
                    : 'border-transparent text-textSecondary dark:text-textSecondary-dark hover:text-text dark:hover:text-text-dark'
                }`}
              >
                Reviews
              </button>
            </div>
            {isOwnProfile && activeContentTab === 'posts' && shouldShowFollowStats && (
              <button
                type="button"
                onClick={() => {
                  setEntryModalMode('post');
                  setIsEntryModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors duration-150 hover:bg-primary/90"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New Post
              </button>
            )}
            {isOwnProfile && (activeContentTab === 'reviews' || !shouldShowFollowStats) && (
              <button
                type="button"
                onClick={() => {
                  setEntryModalMode('review');
                  setIsEntryModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-sm transition-colors duration-150 hover:bg-primary/5 dark:bg-gray-900"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New Review
              </button>
            )}
          </div>

          <div className="space-y-4">
            {(activeContentTab === 'posts' && shouldShowFollowStats ? (
              <AnimatePresence initial={false}>
                {posts.map((item) => (
                  <FeedItemCard
                    key={item.id}
                    item={item}
                    currentUserName={currentUserName}
                    currentUserId={String(viewer?.userId ?? profile.user.userId)}
                    onToggleLike={handleToggleLike}
                    onToggleBookmark={handleToggleBookmark}
                    onAddComment={handleAddComment}
                    onOpenComments={handleOpenComments}
                    onDelete={handleDeleteItem}
                    canDelete={isOwnProfile}
                  />
                ))}
              </AnimatePresence>
            ) : (
              <AnimatePresence initial={false}>
                {reviews.map((item) => (
                  <FeedItemCard
                    key={item.id}
                    item={item}
                    currentUserName={currentUserName}
                    currentUserId={String(viewer?.userId ?? profile.user.userId)}
                    onToggleLike={handleToggleLike}
                    onToggleBookmark={handleToggleBookmark}
                    onAddComment={handleAddComment}
                    onOpenComments={handleOpenComments}
                    onDelete={handleDeleteItem}
                    canDelete={isOwnProfile}
                  />
                ))}
              </AnimatePresence>
            ))}

            {activeContentTab === 'posts' && shouldShowFollowStats && posts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-card dark:bg-card-dark p-10 text-center">
                <p className="text-sm font-medium text-text dark:text-text-dark">No posts available right now.</p>
                {isOwnProfile && <p className="mt-1 text-sm text-textSecondary">Share your first update by creating a new post.</p>}
              </div>
            )}

            {(activeContentTab === 'reviews' || !shouldShowFollowStats) && reviews.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-card dark:bg-card-dark p-10 text-center">
                <p className="text-sm font-medium text-text dark:text-text-dark">No reviews available right now.</p>
                {isOwnProfile && <p className="mt-1 text-sm text-textSecondary">Share your first review by reviewing a book.</p>}
              </div>
            )}
          </div>
        </div>

        {/* Right: Quotes Section - visible to the owner and to friends */}
        {showQuotesPanel && (
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-card dark:bg-card-dark p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-text dark:text-text-dark">
                  Quotes
                </h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {quotes.length} saved
                </span>
              </div>

              {quotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/60 p-4 text-center text-sm text-textSecondary dark:text-textSecondary-dark">
                  No quotes available right now.
                </div>
              ) : (
                <ul className="max-h-[320px] space-y-3 overflow-y-auto pr-1 text-sm text-text dark:text-text-dark scrollbar-hide">
                  {quotes.map((quote) => (
                    <li
                      key={quote.id}
                      className="group relative rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/70 p-3 text-xs leading-relaxed"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium italic text-textSecondary dark:text-textSecondary-dark">"{quote.quote}"</span>
                        {isOwnProfile && (
                          <button
                            type="button"
                            onClick={() => handleDeleteQuote(quote.id)}
                            className="shrink-0 rounded-full border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-textSecondary dark:text-textSecondary-dark">
                        <button
                          type="button"
                          onClick={() => handleToggleQuoteLike(quote.id)}
                          className={`font-semibold transition-colors ${quote.likedByMe ? 'text-primary' : 'text-text dark:text-text-dark hover:text-primary'}`}
                        >
                          ♥ {quote.likeCount}
                        </button>
                        <span>{quote.likeCount > 0 ? 'Likes' : 'No likes yet'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add quote - owner only; friends can view and like but not add */}
              {isOwnProfile && (
                <form onSubmit={handleAddQuote} className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                  <textarea
                    value={quoteDraft}
                    onChange={(event) => setQuoteDraft(event.target.value)}
                    placeholder="Add a quote..."
                    maxLength={500}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs leading-relaxed text-text dark:text-text-dark focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-textSecondary dark:text-textSecondary-dark">
                      {quoteDraft.length}/500
                    </span>
                    <button
                      type="submit"
                      disabled={!quoteDraft.trim() || isAddingQuote}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAddingQuote ? 'Adding...' : 'Add quote'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Followers / Following panel - no dark backdrop; a transparent
          click-catcher closes it, and it's a single block: one header, one
          scrollable list, nothing else on the page scrolls while it's open. */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24 sm:items-center sm:pt-4">
            <div className="absolute inset-0" onClick={() => setActiveModal(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-card dark:border-gray-800 dark:bg-card-dark shadow-2xl"
              style={{ maxHeight: 'min(28rem, 80vh)' }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
                <h3 className="font-bold text-text dark:text-text-dark capitalize">
                  {activeModal} ({activeModal === 'followers' ? profile?.followersCount ?? 0 : profile?.followingCount ?? 0})
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="text-textSecondary dark:text-textSecondary-dark hover:text-text dark:hover:text-text-dark font-bold text-lg"
                >
                  &times;
                </button>
              </div>

              {/* This is the only scrollable region in the panel. */}
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {isLoadingFollowList ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
                    ))}
                  </div>
                ) : followListError ? (
                  <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-center text-sm text-textSecondary dark:text-textSecondary-dark">
                    {followListError}
                  </div>
                ) : isDemoMode ? (
                  <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-center text-sm text-textSecondary dark:text-textSecondary-dark">
                    {activeModal === 'followers' ? 'Followers' : 'Following'} aren't available in demo mode.
                  </div>
                ) : followListEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 text-center text-sm text-textSecondary dark:text-textSecondary-dark">
                    {activeModal === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {followListEntries.map((entry) => (
                      <div
                        key={entry.userId}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                      >
                        <Link
                          to={`/profile/${encodeURIComponent(entry.username)}`}
                          onClick={() => setActiveModal(null)}
                          className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                        >
                          <Avatar name={entry.name} src={resolveMediaUrl(entry.profilePicture ?? undefined)} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-text dark:text-text-dark">{entry.name}</p>
                            <p className="truncate text-xs text-textSecondary dark:text-textSecondary-dark">@{entry.username}</p>
                          </div>
                        </Link>
                        {isOwnProfile && activeModal === 'followers' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFollower(entry)}
                            className="shrink-0 rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-semibold text-textSecondary dark:text-textSecondary-dark transition-colors hover:border-error hover:text-error"
                          >
                            Remove
                          </button>
                        )}
                        {isOwnProfile && activeModal === 'following' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFollowing(entry)}
                            className="shrink-0 rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-semibold text-textSecondary dark:text-textSecondary-dark transition-colors hover:border-error hover:text-error"
                          >
                            Unfollow
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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