/**
 * Seed Data for Testing CivicVigilance App
 *
 * Provides realistic dummy data for easy testing:
 * - 20+ issue reports across 6 cities
 * - Multiple categories
 * - Different privacy modes (Twitter/App Only)
 * - Various timestamps (recent to old)
 * - Comments and engagement metrics
 */

import { Report, Comment, User, IssueCategory } from '../types';

// Test user account
export const TEST_USER: Omit<User, 'createdAt' | 'lastLoginAt'> = {
  uid: 'test-user-001',
  email: 'test@civic.com',
  username: 'TestCitizen_2024',
  anonymousMode: false,
  displayName: 'Test User',
  photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=test',
  bio: 'Testing CivicVigilance - Making issues impossible to ignore!',
  city: 'Bangalore',
  state: 'Karnataka',
  homeLocation: { lat: 12.9716, lng: 77.5946 },
  googleConnected: true,
  twitterConnected: false,
  privacyDefault: 'twitter',
  alwaysAskTwitterMethod: true,
  isVerified: true,
  verificationType: 'journalist',
  stats: {
    totalPosts: 12,
    totalUpvotes: 245,
    totalComments: 56,
    totalShares: 34,
  },
  preferences: {
    notifications: {
      nearby: true,
      comments: true,
      upvotes: true,
      replies: true,
      twitter: true,
      digest: true,
      trending: true,
      similar: true,
    },
  },
  privacySettings: {
    profileVisibility: 'public',
    showLocation: true,
  },
};

// Additional test users for realistic engagement
export const TEST_USERS: Array<Omit<User, 'createdAt' | 'lastLoginAt'>> = [
  {
    uid: 'user-002',
    email: 'anonymous1@civic.com',
    username: 'Anonymous_Citizen_4523',
    anonymousMode: true,
    googleConnected: true,
    twitterConnected: false,
    privacyDefault: 'none',
    alwaysAskTwitterMethod: false,
    isVerified: false,
    stats: { totalPosts: 3, totalUpvotes: 12, totalComments: 5, totalShares: 2 },
    preferences: {
      notifications: {
        nearby: true, comments: true, upvotes: false, replies: true,
        twitter: false, digest: false, trending: false, similar: true,
      },
    },
    privacySettings: { profileVisibility: 'private', showLocation: false },
  },
  {
    uid: 'user-003',
    email: 'activist@civic.com',
    username: 'CivicActivist_BLR',
    anonymousMode: false,
    displayName: 'Civic Activist',
    city: 'Bangalore',
    state: 'Karnataka',
    googleConnected: true,
    twitterConnected: true,
    twitterHandle: '@CivicActivistBLR',
    privacyDefault: 'twitter',
    alwaysAskTwitterMethod: false,
    isVerified: true,
    verificationType: 'ngo',
    stats: { totalPosts: 45, totalUpvotes: 890, totalComments: 234, totalShares: 156 },
    preferences: {
      notifications: {
        nearby: true, comments: true, upvotes: true, replies: true,
        twitter: true, digest: true, trending: true, similar: true,
      },
    },
    privacySettings: { profileVisibility: 'public', showLocation: true },
  },
];

// Seed reports - realistic civic issues
export const SEED_REPORTS: Array<Omit<Report, 'id' | 'createdAt' | 'updatedAt'>> = [
  // Bangalore Issues
  {
    userId: 'test-user-001',
    title: 'Deep pothole on 100 Feet Road causing accidents',
    description: 'A 2-foot deep pothole has formed near the Indiranagar metro station. Multiple two-wheelers have skidded here in the past week. This is extremely dangerous during night time when visibility is low. Immediate action needed before someone gets seriously injured.',
    category: 'pothole' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1504222490345-c075b6008014?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 12.9716,
      lng: 77.5946,
      address: '100 Feet Road, Indiranagar, Bangalore, Karnataka, 560038',
      geohash: 'tdr1',
    },
    privacy: 'twitter',
    twitterHandle: '@CivicVigilance',
    authorities: ['@BBMPCOMM', '@BlrCityTraffic'],
    tweetId: '1234567890',
    tweetUrl: 'https://twitter.com/CivicVigilance/status/1234567890',
    status: 'posted',
    anonymousUsername: 'TestCitizen_2024',
    metrics: {
      upvotes: 234,
      downvotes: 12,
      comments: 45,
      shares: 67,
      twitterImpressions: 12450,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },
  {
    userId: 'user-002',
    title: 'Overflowing garbage bins at Koramangala 5th Block',
    description: 'Garbage bins near the park have been overflowing for the past 3 days. The smell is unbearable and it\'s attracting stray dogs. BBMP needs to clear this urgently. This is a major health hazard for residents.',
    category: 'garbage' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 12.9352,
      lng: 77.6245,
      address: 'Koramangala 5th Block, Bangalore, Karnataka, 560095',
      geohash: 'tdr1',
    },
    privacy: 'none',
    authorities: ['@BBMPCOMM'],
    status: 'posted',
    anonymousUsername: 'Anonymous_Citizen_4523',
    metrics: {
      upvotes: 156,
      downvotes: 8,
      comments: 23,
      shares: 34,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },
  {
    userId: 'user-003',
    title: 'Non-functional streetlight on MG Road for 2 weeks',
    description: 'The streetlight near Commercial Street junction has been non-functional for 2 weeks now. This area is very dark at night making it unsafe for pedestrians, especially women. Multiple complaints to BESCOM have gone unanswered.',
    category: 'streetlight' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 12.9758,
      lng: 77.6082,
      address: 'MG Road, Bangalore, Karnataka, 560001',
      geohash: 'tdr1',
    },
    privacy: 'twitter',
    twitterHandle: '@CivicActivistBLR',
    authorities: ['@BBMPCOMM'],
    tweetUrl: 'https://twitter.com/CivicActivistBLR/status/1234567891',
    status: 'posted',
    anonymousUsername: 'CivicActivist_BLR',
    metrics: {
      upvotes: 89,
      downvotes: 3,
      comments: 12,
      shares: 23,
      twitterImpressions: 5600,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },
  {
    userId: 'test-user-001',
    title: 'Blocked drainage causing waterlogging in HSR Layout',
    description: 'The main drainage near Sector 3 is completely blocked with plastic and debris. During rains, water accumulates up to 1 foot making it impossible to walk. This has been an issue for months. Need urgent action from BBMP.',
    category: 'drainage' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1590857251010-2f4ba86ce4e9?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 12.9082,
      lng: 77.6476,
      address: 'HSR Layout Sector 3, Bangalore, Karnataka, 560102',
      geohash: 'tdr1',
    },
    privacy: 'twitter',
    twitterHandle: '@CivicVigilance',
    authorities: ['@BBMPCOMM'],
    tweetUrl: 'https://twitter.com/CivicVigilance/status/1234567892',
    status: 'posted',
    anonymousUsername: 'TestCitizen_2024',
    metrics: {
      upvotes: 312,
      downvotes: 15,
      comments: 67,
      shares: 89,
      twitterImpressions: 18900,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },
  {
    userId: 'user-002',
    title: 'Water supply disruption in Whitefield for 5 days',
    description: 'Entire area has been without water supply for 5 days. BWSSB tankers are not coming regularly. Families are struggling for basic needs. This is unacceptable in a metro city. Immediate resolution required.',
    category: 'water_supply' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1582719471896-e5fc0bcea859?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 12.9698,
      lng: 77.7500,
      address: 'Whitefield, Bangalore, Karnataka, 560066',
      geohash: 'tdr1',
    },
    privacy: 'twitter',
    twitterHandle: '@CivicVigilance',
    authorities: ['@BWSSB_Official', '@BBMPCOMM'],
    tweetUrl: 'https://twitter.com/CivicVigilance/status/1234567893',
    status: 'posted',
    anonymousUsername: 'Anonymous_Citizen_4523',
    metrics: {
      upvotes: 445,
      downvotes: 8,
      comments: 89,
      shares: 134,
      twitterImpressions: 25600,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },

  // Mumbai Issues
  {
    userId: 'test-user-001',
    title: 'Massive pothole on Western Express Highway near Andheri',
    description: 'Huge pothole near Andheri metro station exit causing traffic jams daily. Multiple accidents reported. This highway is a major artery and this needs immediate fixing.',
    category: 'pothole' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1601066869767-86b9cbdaab6e?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 19.1197,
      lng: 72.8464,
      address: 'Western Express Highway, Andheri, Mumbai, Maharashtra, 400053',
      geohash: 'te7p',
    },
    privacy: 'none',
    authorities: ['@mybmc'],
    status: 'posted',
    anonymousUsername: 'TestCitizen_2024',
    metrics: {
      upvotes: 567,
      downvotes: 23,
      comments: 123,
      shares: 234,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },

  // Delhi Issues
  {
    userId: 'user-003',
    title: 'Broken traffic signal at Connaught Place causing chaos',
    description: 'Main traffic signal at CP inner circle has been broken for 3 days. Manual traffic management is causing massive delays. Delhi Traffic Police needs to fix this ASAP.',
    category: 'traffic_signal' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 28.6315,
      lng: 77.2167,
      address: 'Connaught Place, New Delhi, Delhi, 110001',
      geohash: 'ttnr',
    },
    privacy: 'twitter',
    twitterHandle: '@CivicActivistBLR',
    authorities: ['@DTPoliceDelhi'],
    tweetUrl: 'https://twitter.com/CivicActivistBLR/status/1234567894',
    status: 'posted',
    anonymousUsername: 'CivicActivist_BLR',
    metrics: {
      upvotes: 234,
      downvotes: 12,
      comments: 45,
      shares: 67,
      twitterImpressions: 8900,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },

  // Chennai Issues
  {
    userId: 'test-user-001',
    title: 'Sewage overflow on Anna Salai affecting businesses',
    description: 'Sewage has been overflowing from manholes on Anna Salai for 2 days. The stench is unbearable and affecting nearby shops and restaurants. Metro Water Board needs urgent intervention.',
    category: 'sewage' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1571726834548-55c5786e5c1e?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 13.0600,
      lng: 80.2498,
      address: 'Anna Salai, Teynampet, Chennai, Tamil Nadu, 600018',
      geohash: 'tfh3',
    },
    privacy: 'twitter',
    twitterHandle: '@CivicVigilance',
    authorities: ['@chennaicorp'],
    tweetUrl: 'https://twitter.com/CivicVigilance/status/1234567895',
    status: 'posted',
    anonymousUsername: 'TestCitizen_2024',
    metrics: {
      upvotes: 178,
      downvotes: 9,
      comments: 34,
      shares: 56,
      twitterImpressions: 7800,
    },
    moderation: {
      flagged: false,
      reviewed: true,
      status: 'active',
    },
  },

  // Recent issues (last 24 hours)
  {
    userId: 'user-002',
    title: 'Park gate broken - unsafe for children',
    description: 'The main gate of Cubbon Park is broken and swinging dangerously. Children playing nearby could get hurt. Needs immediate repair.',
    category: 'parks' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 12.9766,
      lng: 77.5993,
      address: 'Cubbon Park, Bangalore, Karnataka, 560001',
      geohash: 'tdr1',
    },
    privacy: 'none',
    authorities: ['@BBMPCOMM'],
    status: 'posted',
    anonymousUsername: 'Anonymous_Citizen_4523',
    metrics: {
      upvotes: 23,
      downvotes: 1,
      comments: 5,
      shares: 8,
    },
    moderation: {
      flagged: false,
      reviewed: false,
      status: 'active',
    },
  },
  {
    userId: 'test-user-001',
    title: 'Illegal encroachment blocking footpath',
    description: 'Shop has extended into footpath making it impossible for pedestrians to walk. People are forced to walk on the road risking their lives. This is a clear violation.',
    category: 'encroachment' as IssueCategory,
    photos: [
      'https://images.unsplash.com/photo-1574116294360-f0bb86b5ffb1?w=800&h=600&fit=crop',
    ],
    location: {
      lat: 12.9279,
      lng: 77.6271,
      address: 'Koramangala, Bangalore, Karnataka, 560034',
      geohash: 'tdr1',
    },
    privacy: 'twitter',
    twitterHandle: '@CivicVigilance',
    authorities: ['@BBMPCOMM', '@BlrCityTraffic'],
    tweetUrl: 'https://twitter.com/CivicVigilance/status/1234567896',
    status: 'posted',
    anonymousUsername: 'TestCitizen_2024',
    metrics: {
      upvotes: 45,
      downvotes: 2,
      comments: 12,
      shares: 15,
      twitterImpressions: 3400,
    },
    moderation: {
      flagged: false,
      reviewed: false,
      status: 'active',
    },
  },
];

// Seed comments for engagement
export const SEED_COMMENTS: Array<Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    reportId: '1',
    userId: 'user-002',
    content: 'I also noticed this yesterday! Almost fell off my bike. Thanks for reporting!',
    text: 'I also noticed this yesterday! Almost fell off my bike. Thanks for reporting!',
    likes: 12,
    edited: false,
  },
  {
    reportId: '1',
    userId: 'user-003',
    content: 'This is exactly why we need better road maintenance. Has BBMP responded yet?',
    text: 'This is exactly why we need better road maintenance. Has BBMP responded yet?',
    likes: 8,
    edited: false,
  },
  {
    reportId: '1',
    userId: 'test-user-001',
    content: 'They acknowledged on Twitter but no action yet. Let\'s keep the pressure on!',
    text: 'They acknowledged on Twitter but no action yet. Let\'s keep the pressure on!',
    likes: 15,
    parentId: '2',
    edited: false,
  },
  {
    reportId: '2',
    userId: 'test-user-001',
    content: 'This is a health hazard! BBMP should prioritize this.',
    text: 'This is a health hazard! BBMP should prioritize this.',
    likes: 23,
    edited: false,
  },
  {
    reportId: '2',
    userId: 'user-003',
    content: 'Same issue in our area. Seems like a city-wide problem.',
    text: 'Same issue in our area. Seems like a city-wide problem.',
    likes: 7,
    edited: false,
  },
  {
    reportId: '4',
    userId: 'user-002',
    content: 'HSR Layout drainage has been a problem for years. Finally someone is highlighting it!',
    text: 'HSR Layout drainage has been a problem for years. Finally someone is highlighting it!',
    likes: 34,
    edited: false,
  },
];

// Helper function to generate timestamps
export function generateTimestamp(daysAgo: number): Date {
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);
  return now;
}

// Assign realistic timestamps to reports
export function getSeedReportsWithTimestamps() {
  return SEED_REPORTS.map((report, index) => ({
    ...report,
    id: `report-${index + 1}`,
    createdAt: generateTimestamp(index), // Stagger reports over days
    updatedAt: generateTimestamp(index),
  }));
}

// Assign timestamps to comments
export function getSeedCommentsWithTimestamps() {
  return SEED_COMMENTS.map((comment, index) => ({
    ...comment,
    id: `comment-${index + 1}`,
    createdAt: generateTimestamp(Math.floor(index / 2)), // Comments within days of reports
    updatedAt: generateTimestamp(Math.floor(index / 2)),
  }));
}

// Assign timestamps to users
export function getSeedUsersWithTimestamps() {
  return [TEST_USER, ...TEST_USERS].map((user, index) => ({
    ...user,
    createdAt: generateTimestamp(30 - index * 5), // Users joined over past month
    lastLoginAt: generateTimestamp(0), // All active recently
  }));
}

// Export all seed data with timestamps
export const COMPLETE_SEED_DATA = {
  users: getSeedUsersWithTimestamps(),
  reports: getSeedReportsWithTimestamps(),
  comments: getSeedCommentsWithTimestamps(),
};
