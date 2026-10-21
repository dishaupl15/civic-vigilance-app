import { getDB } from './db';

export type NewIssue = {
  user_id: number;
  title: string;
  description?: string;
  category: string;
  image_url?: string;
  lat?: number; lng?: number; address?: string;
};

export function listIssues(sort: 'trending' | 'newest' | 'nearby' = 'trending') {
  const db = getDB();
  let sql = 'SELECT * FROM issues';
  if (sort === 'newest') sql += ' ORDER BY datetime(created_at) DESC';
  else sql += ' ORDER BY (upvotes - downvotes) DESC, datetime(created_at) DESC';
  const rows = db.getAllSync?.(sql) as any[];
  return rows || [];
}

export function createIssueSqlite(payload: NewIssue) {
  const db = getDB();
  const now = new Date().toISOString();
  db.runSync?.(`INSERT INTO issues(user_id,title,description,category,image_url,lat,lng,address,created_at)
    VALUES (?,?,?,?,?,?,?,?,?);`, [payload.user_id, payload.title, payload.description || null, payload.category, payload.image_url || null, payload.lat ?? null, payload.lng ?? null, payload.address || null, now]);
  const id = (db.getFirstSync?.('SELECT last_insert_rowid() as id') as any)?.id as number;
  return db.getFirstSync?.('SELECT * FROM issues WHERE id=?', [id]);
}

export function listUserIssues(userId: number) {
  const db = getDB();
  return db.getAllSync?.('SELECT * FROM issues WHERE user_id=? ORDER BY datetime(created_at) DESC', [userId]) as any[];
}

export function getIssueByIdSqlite(id: number) {
  return getDB().getFirstSync?.('SELECT * FROM issues WHERE id=?', [id]);
}

export function listCommentsSqlite(issueId: number) {
  return getDB().getAllSync?.('SELECT * FROM comments WHERE issue_id=? ORDER BY datetime(created_at) ASC', [issueId]) as any[];
}

export function addCommentSqlite(issueId: number, userId: number, content: string, parentId?: number | null) {
  const now = new Date().toISOString();
  getDB().runSync?.('INSERT INTO comments(issue_id,user_id,parent_id,content,created_at) VALUES (?,?,?,?,?)', [issueId, userId, parentId ?? null, content, now]);
  return getDB().getFirstSync?.('SELECT * FROM comments WHERE id=last_insert_rowid()');
}

export function getUserVoteSqlite(issueId: number, userId: number): -1 | 0 | 1 {
  const row: any = getDB().getFirstSync?.('SELECT value FROM votes WHERE issue_id=? AND user_id=?', [issueId, userId]);
  return (row?.value ?? 0) as -1 | 0 | 1;
}

export function castVoteSqlite(issueId: number, userId: number, value: -1 | 1) {
  const db = getDB();
  const cur: any = db.getFirstSync?.('SELECT id,value FROM votes WHERE issue_id=? AND user_id=?', [issueId, userId]);
  const now = new Date().toISOString();
  let next: -1 | 0 | 1 = value;
  if (cur?.value === value) next = 0; // toggle off

  db.withTransactionSync?.(() => {
    if (cur?.id) {
      if (next === 0) db.runSync?.('DELETE FROM votes WHERE id=?', [cur.id]);
      else db.runSync?.('UPDATE votes SET value=?, created_at=? WHERE id=?', [next, now, cur.id]);
    } else {
      db.runSync?.('INSERT INTO votes(user_id, issue_id, value, created_at) VALUES (?,?,?,?)', [userId, issueId, next, now]);
    }
    // Update counters
    // Recalculate from votes for accuracy
    const counts: any = db.getFirstSync?.('SELECT sum(value=1) as up, sum(value=-1) as down FROM votes WHERE issue_id=?', [issueId]);
    db.runSync?.('UPDATE issues SET upvotes=?, downvotes=? WHERE id=?', [counts?.up || 0, counts?.down || 0, issueId]);
  });
  const issue: any = db.getFirstSync?.('SELECT upvotes, downvotes FROM issues WHERE id=?', [issueId]);
  return { vote: next, upvotes: issue?.upvotes || 0, downvotes: issue?.downvotes || 0 } as any;
}
