import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

let db: any = null;

// Web fallback: Simple in-memory mock database
class MockDatabase {
  private data: any = {
    users: [],
    profiles: [],
    issues: [],
    votes: [],
    comments: [],
    authorities: []
  };
  private nextId: any = {
    users: 1,
    profiles: 1,
    issues: 1,
    votes: 1,
    comments: 1,
    authorities: 1
  };

  getFirstSync(query: string, params?: any[]) {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('last_insert_rowid')) {
      return { id: this.nextId.users - 1 };
    }
    if (lowerQuery.includes('from users')) {
      const email = params?.[0];
      if (email) {
        return this.data.users.find((u: any) => u.email === email);
      }
      return this.data.users[0];
    }
    return null;
  }

  runSync(query: string, params?: any[]) {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('insert into users')) {
      const [email, password_hash, created_at] = params || [];
      const id = this.nextId.users++;
      this.data.users.push({ id, email, password_hash, created_at });
    } else if (lowerQuery.includes('insert into profiles') || lowerQuery.includes('insert or replace into profiles')) {
      const [user_id, username, full_name, created_at] = params || [];
      this.data.profiles.push({ user_id, username, full_name, created_at });
    }
  }

  execSync(query: string) {
    // No-op for schema creation on web
  }

  withTransactionSync(fn: () => void) {
    fn();
  }

  getAllSync(query: string, params?: any[]) {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('from issues')) {
      return this.data.issues;
    }
    if (lowerQuery.includes('from comments')) {
      return this.data.comments;
    }
    return [];
  }
}

export function getDB() {
  if (!db) {
    if (Platform.OS === 'web') {
      db = new MockDatabase();
    } else {
      db = SQLite.openDatabaseSync?.('civicvigilance.db') || (SQLite as any).openDatabase('civicvigilance.db');
    }
  }
  return db!;
}

export function ensureSchema() {
  const db = getDB();
  db.withTransactionSync?.(() => {
    db.execSync?.(`PRAGMA foreign_keys = ON;`);

    // users & profiles (PRD Section 7.2)
    db.execSync?.(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`);

    db.execSync?.(`CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      anonymous_mode INTEGER DEFAULT 1,
      display_name TEXT,
      avatar_url TEXT,
      bio TEXT,
      city TEXT,
      state TEXT,
      twitter_connected INTEGER DEFAULT 0,
      twitter_handle TEXT,
      privacy_default TEXT DEFAULT 'twitter',
      always_ask_twitter_method INTEGER DEFAULT 1,
      is_verified INTEGER DEFAULT 0,
      verification_type TEXT,
      total_posts INTEGER DEFAULT 0,
      total_upvotes INTEGER DEFAULT 0,
      total_comments INTEGER DEFAULT 0,
      total_shares INTEGER DEFAULT 0,
      notif_nearby INTEGER DEFAULT 1,
      notif_comments INTEGER DEFAULT 1,
      notif_upvotes INTEGER DEFAULT 1,
      notif_twitter INTEGER DEFAULT 1,
      created_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );`);

    // reports/issues (PRD Section 7.2)
    db.execSync?.(`CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      photos TEXT DEFAULT '[]',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      address TEXT NOT NULL,
      geohash TEXT NOT NULL,
      privacy TEXT DEFAULT 'twitter',
      twitter_handle TEXT,
      authorities TEXT DEFAULT '[]',
      tweet_id TEXT,
      tweet_url TEXT,
      status TEXT DEFAULT 'pending',
      anonymous_username TEXT NOT NULL,
      upvotes INTEGER NOT NULL DEFAULT 0,
      downvotes INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      twitter_impressions INTEGER,
      flagged INTEGER DEFAULT 0,
      reviewed INTEGER DEFAULT 0,
      moderation_status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );`);

    db.execSync?.(`CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at DESC);`);
    db.execSync?.(`CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);`);
    db.execSync?.(`CREATE INDEX IF NOT EXISTS idx_issues_geohash ON issues(geohash);`);

    // votes
    db.execSync?.(`CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      issue_id INTEGER NOT NULL,
      value INTEGER NOT NULL CHECK (value IN (-1,1)),
      created_at TEXT NOT NULL,
      UNIQUE(user_id, issue_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );`);

    // comments (with nesting up to 5 levels - PRD 5.4)
    db.execSync?.(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      parent_id INTEGER,
      content TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      edited INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_id) REFERENCES comments(id) ON DELETE CASCADE
    );`);

    db.execSync?.(`CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);`);
    db.execSync?.(`CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);`);

    // authorities (PRD Section 7.3 - geohash-based matching)
    db.execSync?.(`CREATE TABLE IF NOT EXISTS authorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      twitter_handle TEXT NOT NULL,
      jurisdiction_type TEXT,
      city TEXT,
      state TEXT,
      geohashes TEXT DEFAULT '[]',
      issue_categories TEXT DEFAULT '[]',
      priority INTEGER DEFAULT 2,
      status TEXT DEFAULT 'active'
    );`);

    db.execSync?.(`CREATE INDEX IF NOT EXISTS idx_authorities_city ON authorities(city);`);

    // pending_twitter_posts (offline queue - PRD 7.4)
    db.execSync?.(`CREATE TABLE IF NOT EXISTS pending_twitter_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      method TEXT NOT NULL,
      tweet_text TEXT NOT NULL,
      image_url TEXT,
      authorities TEXT DEFAULT '[]',
      attempts INTEGER DEFAULT 0,
      last_attempt_at TEXT,
      error TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY(report_id) REFERENCES issues(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );`);
  });
}

