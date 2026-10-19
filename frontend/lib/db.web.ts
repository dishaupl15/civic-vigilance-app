type Row = Record<string, any>;

class WebDatabase {
  private readonly storageKey = 'civic_vigilance_web_database_v1';
  private data: Record<string, Row[]> = {
    users: [],
    profiles: [],
    issues: [],
    votes: [],
    comments: [],
    authorities: [],
  };

  private nextId: Record<string, number> = {
    users: 1,
    profiles: 1,
    issues: 1,
    votes: 1,
    comments: 1,
    authorities: 1,
  };

  private lastInsertId = 0;

  constructor() {
    try {
      const raw = (globalThis as any).localStorage?.getItem(this.storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.data) this.data = { ...this.data, ...saved.data };
        if (saved?.nextId) this.nextId = { ...this.nextId, ...saved.nextId };
        if (Number.isInteger(saved?.lastInsertId)) this.lastInsertId = saved.lastInsertId;
      }
    } catch {
      // Corrupt or unavailable browser storage falls back to an empty local database.
    }
  }

  private persist() {
    try {
      (globalThis as any).localStorage?.setItem(this.storageKey, JSON.stringify({
        data: this.data,
        nextId: this.nextId,
        lastInsertId: this.lastInsertId,
      }));
    } catch {
      // Private browsing/storage quotas may make persistence unavailable.
    }
  }

  getFirstSync(query: string, params: any[] = []) {
    const sql = query.toLowerCase();
    if (sql.includes('last_insert_rowid')) return { id: this.lastInsertId };

    if (sql.includes('from users')) {
      if (sql.includes('where email')) {
        return this.data.users.find((user) => user.email === params[0]) ?? null;
      }
      if (sql.includes('where id')) {
        return this.data.users.find((user) => user.id === Number(params[0])) ?? null;
      }
      return this.data.users[0] ?? null;
    }

    if (sql.includes('count(*)') && sql.includes('from issues')) {
      return { c: this.data.issues.length };
    }
    if (sql.includes('from issues') && sql.includes('where id')) {
      return this.data.issues.find((issue) => issue.id === Number(params[0])) ?? null;
    }
    if (sql.includes('from votes')) {
      return this.data.votes.find(
        (vote) => vote.issue_id === Number(params[0]) && vote.user_id === Number(params[1])
      ) ?? null;
    }
    return null;
  }

  runSync(query: string, params: any[] = []) {
    const sql = query.toLowerCase();

    if (sql.includes('insert into users')) {
      const [email, password_hash, created_at] = params;
      if (this.data.users.some((user) => user.email === email)) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      const id = this.nextId.users++;
      this.lastInsertId = id;
      this.data.users.push({ id, email, password_hash, created_at });
      this.persist();
      return;
    }

    if (sql.includes('insert into issues')) {
      const id = this.nextId.issues++;
      this.lastInsertId = id;
      this.data.issues.push({ id, created_at: new Date().toISOString(), upvotes: 0, downvotes: 0 });
      this.persist();
      return;
    }

    if (sql.includes('insert into profiles') || sql.includes('insert or replace into profiles')) {
      const [user_id, username, full_name, created_at] = params;
      this.data.profiles = this.data.profiles.filter((profile) => profile.user_id !== Number(user_id));
      this.data.profiles.push({ user_id: Number(user_id), username, full_name, created_at });
      this.persist();
      return;
    }

    if (sql.includes('insert into comments')) {
      const [issue_id, user_id, parent_id, content, created_at] = params;
      const id = this.nextId.comments++;
      this.lastInsertId = id;
      this.data.comments.push({ id, issue_id, user_id, parent_id, content, created_at });
      this.persist();
      return;
    }

    if (sql.includes('insert into votes')) {
      const [user_id, issue_id, value, created_at] = params;
      const id = this.nextId.votes++;
      this.lastInsertId = id;
      this.data.votes.push({ id, user_id, issue_id, value, created_at });
      this.persist();
      return;
    }

    if (sql.includes('delete from votes')) {
      this.data.votes = this.data.votes.filter((vote) => vote.id !== Number(params[0]));
      this.persist();
    }
  }

  execSync(_query: string) {
    // Schema creation is unnecessary for the in-memory web implementation.
  }

  withTransactionSync(operation: () => void) {
    operation();
  }

  getAllSync(query: string, params: any[] = []) {
    const sql = query.toLowerCase();
    if (sql.includes('from issues')) {
      if (sql.includes('where user_id')) {
        return this.data.issues.filter((issue) => issue.user_id === Number(params[0]));
      }
      return [...this.data.issues];
    }
    if (sql.includes('from comments')) {
      return this.data.comments.filter((comment) => comment.issue_id === Number(params[0]));
    }
    return [];
  }
}

const webDatabase = new WebDatabase();

export function getDB() {
  return webDatabase;
}

export function ensureSchema() {
  // The web database initializes its collections eagerly.
}
