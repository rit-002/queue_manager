const { v4: uuidv4 } = require("uuid");

class QueueManager {
  constructor() {
    this.events = {}; // store events: { "eventId_orgId": { ... } }
    this.users = {}; // store users per event: { "eventId_orgId": [ { userId, token, joinedAt } ] }
  }

  // Create a queue
  createQueue(eventName, orgId, limit = 3, description = "") {
    const key = `${eventName}_${orgId}`;
    if (this.events[key]) return this.events[key];

    const event = {
      name: eventName,
      orgId,
      limit,
      description,
      createdAt: new Date(),
      freezeUntil: null,
    };

    this.events[key] = event;
    this.users[key] = [];
    return event;
  }

  // Join a queue
  joinQueue(eventName, orgId, userId) {
    const key = `${eventName}_${orgId}`;
    const event = this.events[key];
    if (!event) throw new Error("Event not found");

    const now = new Date();

    // Check if queue is frozen
    if (event.freezeUntil && event.freezeUntil > now) {
      const remaining = Math.ceil((event.freezeUntil - now) / 1000);
      return { status: "wait", waitTime: remaining };
    }

    // Check if user already joined
    const already = this.users[key].find((u) => u.userId === userId);
    if (already) return { status: "already", userId };

    const count = this.users[key].length;

    if (count < event.limit) {
      const token = uuidv4();
      this.users[key].push({ userId, token, joinedAt: now });

      // Freeze if limit reached
      if (count + 1 >= event.limit) {
        event.freezeUntil = new Date(now.getTime() + 30 * 1000);
      }

      return { status: "joined", token };
    }

    // Over limit, enforce freeze
    event.freezeUntil = new Date(now.getTime() + 30 * 1000);
    return { status: "wait", waitTime: 30 };
  }

  // Get queue status
  getQueueStatus(eventName, orgId) {
    const key = `${eventName}_${orgId}`;
    const event = this.events[key];
    if (!event) return null;

    const now = new Date();
    let waitTime = 0;
    if (event.freezeUntil && event.freezeUntil > now) {
      waitTime = Math.ceil((event.freezeUntil - now) / 1000);
    }

    return { ...event, users: this.users[key], waitTime };
  }

  // Reset queue
  resetQueue(eventName, orgId) {
    const key = `${eventName}_${orgId}`;
    if (!this.events[key]) return false;

    delete this.events[key];
    delete this.users[key];
    return true;
  }
}

module.exports = QueueManager;
