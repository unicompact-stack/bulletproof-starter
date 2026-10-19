const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Store {
  constructor(file) {
    this.file = file;
    this.db = {
      users: [],
      sessions: [],
      events: [],
      lives: {}
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8');
        const parsed = JSON.parse(raw);
        this.db = { ...this.db, ...parsed, lives: parsed.lives || {} };
      }
    } catch (err) {
      console.error('db load failed, starting empty', err.message);
    }
  }

  save() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  uid(bytes = 8) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  getUser(id) {
    return this.db.users.find((u) => u.id === id) || null;
  }

  getUserByEmail(email) {
    return this.db.users.find((u) => u.email === String(email || '').trim().toLowerCase()) || null;
  }

  addUser(user) {
    this.db.users.push(user);
    this.save();
    return user;
  }

  updateUser(id, patch) {
    const user = this.getUser(id);
    if (!user) return null;
    Object.assign(user, patch);
    this.save();
    return user;
  }

  createSession(userId) {
    const sid = this.uid(24);
    this.db.sessions.push({ sid, userId, createdAt: Date.now() });
    this.save();
    return sid;
  }

  getSession(sid) {
    return this.db.sessions.find((s) => s.sid === sid) || null;
  }

  deleteSession(sid) {
    this.db.sessions = this.db.sessions.filter((s) => s.sid !== sid);
    this.save();
  }

  eventsOf(userId) {
    return this.db.events
      .filter((e) => e.userId === userId)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)));
  }

  getEvent(id) {
    return this.db.events.find((e) => e.id === id) || null;
  }

  getEventByCode(code) {
    return this.db.events.find((e) => e.code === String(code || '').toUpperCase()) || null;
  }

  addEvent(event) {
    this.db.events.push(event);
    this.save();
    return event;
  }

  updateEvent(id, patch) {
    const event = this.getEvent(id);
    if (!event) return null;
    Object.assign(event, patch, { updatedAt: Date.now() });
    this.save();
    return event;
  }

  deleteEvent(id) {
    this.db.events = this.db.events.filter((e) => e.id !== id);
    delete this.db.lives[id];
    this.save();
  }

  getLive(eventId) {
    return this.db.lives[eventId] || null;
  }

  saveLive(eventId, live) {
    this.db.lives[eventId] = live;
    this.save();
    return live;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || '').split(':');
    const verify = crypto.scryptSync(String(password), salt, 32);
    const left = Buffer.from(hash, 'hex');
    if (left.length !== verify.length) return false;
    return crypto.timingSafeEqual(left, verify);
  } catch {
    return false;
  }
}

function makeCode(store) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let n = 0; n < 20; n += 1) {
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i += 1) code += alphabet[bytes[i] % alphabet.length];
    if (!store.getEventByCode(code)) return code;
  }
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

module.exports = { Store, hashPassword, verifyPassword, makeCode };
