const { v4: uuidv4 } = require("uuid");

class QueueManager {
  constructor() {
    this.events = {}; // memory ke andar event queues
    this.defaultFreeze = 30 * 1000;
  }

  _getKey(eventName, orgId) {
    return `queue:${eventName}_${orgId}`;
  }

  async createQueue(
    eventName,
    orgId,
    limit = 1,
    description = "",
    freezeDuration = null
  ) {
    const key = this._getKey(eventName, orgId);
    if (this.events[key]) return this.events[key]; // already created

    const event = {
      name: eventName,
      orgId,
      limit,
      description,
      createdAt: Date.now(),
      freezeUntil: null,
      freezeDuration: freezeDuration || this.defaultFreeze,
      users: [],
    };

    this.events[key] = event;
    return event;
  }

  async joinQueue(eventName, orgId, userId) {
    const key = this._getKey(eventName, orgId);
    const event = this.events[key];
    if (!event) throw new Error("Event not found");

    const now = Date.now();

    // cleanup freeze
    if (event.freezeUntil && event.freezeUntil <= now) {
      event.freezeUntil = null;
    }

    if (event.freezeUntil && event.freezeUntil > now) {
      const remaining = Math.ceil((event.freezeUntil - now) / 1000);
      return { status: "wait", waitTime: remaining };
    }

    // already joined
    if (event.users.find((u) => u.userId === userId)) {
      return { status: "already", userId };
    }

    if (event.users.length >= event.limit) {
      event.freezeUntil = now + Number(event.freezeDuration);
      return { status: "wait", waitTime: Number(event.freezeDuration) / 1000 };
    }

    // join
    const token = uuidv4();
    event.users.push({ userId, token, joinedAt: now });

    if (event.users.length >= event.limit) {
      event.freezeUntil = now + Number(event.freezeDuration);
    }

    return { status: "joined", token };
  }

  async getQueueStatus(eventName, orgId) {
    const key = this._getKey(eventName, orgId);
    const event = this.events[key];
    if (!event) return null;

    const now = Date.now();

    if (event.freezeUntil && event.freezeUntil <= now) {
      event.freezeUntil = null;
    }

    let waitTime = 0;
    if (event.freezeUntil) {
      waitTime = Math.ceil((event.freezeUntil - now) / 1000);
    }

    return { ...event, waitTime };
  }
}

module.exports = QueueManager;
