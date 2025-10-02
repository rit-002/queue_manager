const { v4: uuidv4 } = require("uuid");

class QueueManager {
  constructor() {
    this.events = {}; // { "eventId_orgId": { name, orgId, limit, freezeUntil, ... } }
    this.users = {}; // { "eventId_orgId": [ { userId, token, joinedAt } ] }
    this.defaultFreeze = 30 * 1000; // default 30 sec freeze
  }

  // Generate unique key
  _getKey(eventName, orgId) {
    return `${eventName}_${orgId}`;
  }

  // Cleanup freeze if expired
  _cleanupFreeze(event) {
    const now = new Date();
    if (event.freezeUntil && event.freezeUntil <= now) {
      event.freezeUntil = null;
    }
  }

  // Create a queue
  createQueue(
    eventName,
    orgId,
    limit = 3,
    description = "",
    freezeDuration = null
  ) {
    const key = this._getKey(eventName, orgId);
    if (this.events[key]) return this.events[key];

    const event = {
      name: eventName,
      orgId,
      limit,
      description,
      createdAt: new Date(),
      freezeUntil: null,
      freezeDuration: freezeDuration || this.defaultFreeze, // custom freeze
    };

    this.events[key] = event;
    this.users[key] = [];
    return event;
  }

  // Join a queue
  joinQueue(eventName, orgId, userId) {
    const key = this._getKey(eventName, orgId);
    const event = this.events[key];
    if (!event) throw new Error("Event not found");

    const now = new Date();

    // 🔹 Auto-reset expired freeze
    this._cleanupFreeze(event);

    // 🔹 If queue still frozen
    if (event.freezeUntil && event.freezeUntil > now) {
      const remaining = Math.ceil((event.freezeUntil - now) / 1000);
      return { status: "wait", waitTime: remaining };
    }

    // 🔹 Prevent duplicate join
    const already = this.users[key].find((u) => u.userId === userId);
    if (already) return { status: "already", userId };

    const count = this.users[key].length;

    // 🔹 If queue full → set freeze immediately
    if (count >= event.limit) {
      event.freezeUntil = new Date(now.getTime() + event.freezeDuration);
      return { status: "wait", waitTime: event.freezeDuration / 1000 };
    }

    // 🔹 Allow join
    const token = uuidv4();
    this.users[key].push({ userId, token, joinedAt: now });

    // 🔹 If queue just became full → freeze for next users
    if (this.users[key].length >= event.limit) {
      event.freezeUntil = new Date(now.getTime() + event.freezeDuration);
    }

    return { status: "joined", token };
  }

  // Get queue status
  getQueueStatus(eventName, orgId) {
    const key = this._getKey(eventName, orgId);
    const event = this.events[key];
    if (!event) return null;

    this._cleanupFreeze(event);

    let waitTime = 0;
    if (event.freezeUntil) {
      waitTime = Math.ceil((event.freezeUntil - new Date()) / 1000);
    }

    return { ...event, users: this.users[key], waitTime };
  }

  // Reset queue
  resetQueue(eventName, orgId) {
    const key = this._getKey(eventName, orgId);
    if (!this.events[key]) return false;

    delete this.events[key];
    delete this.users[key];
    return true;
  }

  // 🔹 Background auto-clean expired freezes (optional)
  autoCleanup(interval = 5000) {
    setInterval(() => {
      const now = new Date();
      for (const key in this.events) {
        if (
          this.events[key].freezeUntil &&
          this.events[key].freezeUntil <= now
        ) {
          this.events[key].freezeUntil = null;
        }
      }
    }, interval);
  }
}

module.exports = QueueManager;
