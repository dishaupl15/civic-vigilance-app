// Issue Categories as per PDF spec
export type IssueCategory =
  | 'pothole'
  | 'garbage'
  | 'streetlight'
  | 'drainage'
  | 'water_supply'
  | 'sewage'
  | 'traffic_signal'
  | 'encroachment'
  | 'stray_animals'
  | 'parks'
  | 'other';

// Category key type for mapping
export type CategoryKey = IssueCategory;

// Twitter sharing method - simplified deep link approach
export type TwitterPostingMethod = 'twitter' | 'none';

// Posting status (NOT resolution status - we don't track if authorities fixed issues)
export type PostingStatus = 'pending' | 'posted' | 'failed';

// Authority types
export type AuthorityJurisdictionType = 'national' | 'state' | 'city' | 'ward' | 'department';

// User type with complete profile (aligned with PRD Section 7.2)
export interface User {
  uid: string;
  email?: string; // Optional for anonymous users

  // USERNAME SELECTION - NEW per PRD Section 5.1.1
  username: string; // Chosen or auto-generated "Anonymous_Citizen_XXXX"
  anonymousMode: boolean; // If true, hide real identity
  displayName?: string; // Real name (optional)
  full_name?: string; // DB field often used for display name/username in this codebase

  photoURL?: string;
  bio?: string;
  city?: string;
  state?: string;
  homeLocation?: { lat: number; lng: number };

  // Connected accounts
  googleConnected: boolean;
  twitterConnected: boolean;
  twitterHandle?: string;
  twitterUserId?: string;

  // Privacy & Amplification preferences (PRD Section 5.2 Stage 3)
  privacyDefault: TwitterPostingMethod; // Default for new reports
  alwaysAskTwitterMethod: boolean; // Show privacy selection every time

  // Verification (v1.5 feature - PRD Section 16.5)
  isVerified: boolean; // ⭐ badge for journalists, RWAs
  verificationType?: 'journalist' | 'rwa' | 'ngo' | 'official';

  // Statistics (ENGAGEMENT metrics, NOT resolution - PRD Section 1.2)
  stats: {
    totalPosts: number; // "Voices Raised"
    totalUpvotes: number; // "Community Impact"
    totalComments: number;
    totalShares: number; // "Amplification"
  };

  // Notification Settings (PRD Section 5.7.1)
  preferences: {
    notifications: {
      nearby: boolean; // Issues within 2km
      comments: boolean; // Comments on my posts
      upvotes: boolean; // Upvotes on my posts
      replies: boolean; // Replies to my comments
      twitter: boolean; // Twitter engagement
      digest: boolean; // Weekly digest
      trending: boolean; // Trending issues in city
      similar: boolean; // Similar issues nearby
    };
  };

  privacySettings: {
    profileVisibility: 'public' | 'private';
    showLocation: boolean;
  };

  createdAt: Date;
  lastLoginAt: Date;
}

// Report/Issue type (aligned with PRD Section 7.2)
export interface Report {
  id: string;
  userId: string;

  // Content
  title: string;
  description?: string;
  category: IssueCategory;
  photos: string[]; // Firebase Storage URLs (up to 3 per PRD 5.2)

  // Location (PRD Section 5.2 Stage 2D - full address required)
  location: {
    lat: number;
    lng: number;
    address: string; // Full: "Casa Rio Gold Road, Kalyan, Maharashtra, 421204"
    geohash: string;
  };

  // Privacy & Amplification (PRD Section 5.2 Stage 3 - THE KEY FEATURE)
  privacy: TwitterPostingMethod; // 'twitter' | 'none'
  twitterHandle?: string; // Which handle posted (for display)
  authorities: string[]; // @handles to tag (PRD Section 5.2 Stage 4B)

  // Twitter posting metadata
  tweetId?: string;
  tweetUrl?: string;

  // Posting status (NOT resolution - we don't track if authorities fixed it!)
  status: PostingStatus; // 'pending' | 'posted' | 'failed'

  // Anonymous username (PRD Section 5.1.1)
  anonymousUsername: string; // Display name for this post

  // Engagement metrics (PRD Section 5.3.2 - what we DO measure)
  metrics: {
    upvotes: number;
    downvotes: number;
    comments: number;
    shares: number;
    twitterImpressions?: number; // Fetched via API every 6h
  };

  // Moderation (PRD Section 5.1 - basic moderation)
  moderation: {
    flagged: boolean;
    reviewed: boolean;
    status: 'active' | 'hidden' | 'removed';
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// Social platform contact information
export interface SocialPlatformHandle {
  handle?: string; // @handle or username
  verified?: boolean;
  active?: boolean;
  lastChecked?: Date;
  url?: string; // Full profile URL
}

// Authority database structure (PRD Section 7.3) - ENHANCED WITH MULTI-PLATFORM
export interface Authority {
  id: string;
  name: string;
  nameLocal?: string;
  verificationStatus?: 'verified' | 'seed' | 'expired' | 'rejected';
  sourceUrl?: string;
  lastVerifiedAt?: Date;

  // Backward compatibility - direct twitter handle
  twitter?: string;

  // Social Media Platforms (multi-platform support for better reach)
  socialMedia?: {
    twitter?: SocialPlatformHandle;
    whatsapp?: {
      number?: string; // Format: +91XXXXXXXXXX
      businessVerified?: boolean;
      active?: boolean;
      lastChecked?: Date;
    };
    instagram?: SocialPlatformHandle;
    facebook?: SocialPlatformHandle;
    telegram?: {
      handle?: string;
      chatId?: string;
      active: boolean;
    };
  };

  // Jurisdiction (geohash-based matching - PRD Section 7.3)
  jurisdiction: {
    type: AuthorityJurisdictionType;
    level: number; // 1=national, 2=state, 3=city, 4=ward
    country: string;
    state?: string;
    city?: string;
    ward?: number;
    zone?: string;
    geohashes: string[]; // for efficient queries
  };

  // Issue categories this authority handles
  issueCategories: IssueCategory[];

  // Priority (1=primary, 2=secondary, 3=fallback)
  priority: number;

  // Contact info
  contactInfo?: {
    email?: string;
    phone?: string; // Customer service phone
    tollFree?: string; // Toll-free helpline
    website?: string;
    mobileApp?: string; // Link to official app
  };

  // Response metrics (optional - for displaying authority responsiveness)
  responseMetrics?: {
    averageResponseTime?: number; // in hours
    totalIssuesAddressed?: number;
    lastActive?: Date;
  };

  metrics?: {
    totalIssuesAddressed?: number;
    averageResponseTime?: number;
  };

  status: 'active' | 'inactive';
  verifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  reportId: string;
  userId: string;
  content: string;
  text?: string;
  likes?: number;
  parentId?: string;
  createdAt: Date;
  updatedAt?: Date;
  edited?: boolean;
}

export interface Vote {
  id: string;
  reportId: string;
  userId: string;
  type: 'upvote' | 'downvote';
  createdAt: Date;
}

export interface Follower {
  id: string;
  reportId: string;
  userId: string;
  createdAt: Date;
}

// Notification types (PRD Section 5.7.1 - Smart Notifications)
export interface Notification {
  id: string;
  userId: string;
  type:
  | 'report_submitted' // Your issue is now live
  | 'twitter_post_success' // Posted to Twitter
  | 'comment' // Comments on my posts
  | 'reply' // Replies to my comments
  | 'upvote_milestone' // Upvotes on my posts
  | 'nearby_issue' // New issues within 2km
  | 'trending_issue' // Issues gaining traction
  | 'similar_issue' // Similar issues nearby
  | 'twitter_engagement' // Twitter retweets/likes by authorities
  | 'weekly_digest'; // Weekly summary
  title: string;
  body: string;
  data: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

// Pending Twitter post queue
export interface PendingTwitterPost {
  id: string;
  reportId: string;
  userId: string;
  method: 'twitter';
  tweetText: string;
  imageUrl: string;
  authorities: string[]; // handles to tag
  attempts: number;
  lastAttemptAt?: Date;
  error?: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  createdAt: Date;
}

// Legacy type alias for backwards compatibility
export type Issue = Report;

// Extended Issue type with optional display properties from joined data
export interface IssueWithUserData {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: IssueCategory;
  photos: string[];
  location?: {
    lat?: number;
    lng?: number;
    address?: string;
    geohash?: string;
  };
  locationAccuracyM?: number;
  locationSource?: 'gps' | 'manual';
  locationConfirmed?: boolean;
  privacy?: TwitterPostingMethod;
  authorities?: string[];
  tweetId?: string;
  tweetUrl?: string;
  status?: PostingStatus;
  anonymousUsername?: string;
  metrics?: Partial<Report['metrics']>;
  moderation?: Report['moderation'];
  updatedAt?: Date | string;
  isVerified?: boolean; // From user join
  commentsCount?: number; // Computed field
  shares?: number; // From metrics or computed
  upvotes?: number; // From metrics.upvotes
  downvotes?: number; // From metrics.downvotes
  imageUrl?: string; // First photo from photos array
  address?: string;
  lat?: number;
  lng?: number;
  createdAt: Date | string; // Can be string from database
}
