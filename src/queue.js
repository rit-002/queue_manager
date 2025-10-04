import { v4 as uuidv4 } from "uuid";
import EventEmitter from "events";

class QueueManager extends EventEmitter {
  constructor() {
    super();
    this.events = {};
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
    if (this.events[key]) return this.events[key];

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
    this.emit("update", { type: "create", event });
    return event;
  }

  async joinQueue(eventName, orgId, userId) {
    const key = this._getKey(eventName, orgId);
    const event = this.events[key];
    if (!event) throw new Error("Event not found");

    const now = Date.now();
    if (event.freezeUntil && event.freezeUntil <= now) event.freezeUntil = null;

    if (event.freezeUntil && event.freezeUntil > now) {
      return {
        status: "wait",
        waitTime: Math.ceil((event.freezeUntil - now) / 1000),
      };
    }

    if (event.users.find((u) => u.userId === userId)) {
      return { status: "already", userId };
    }

    if (event.users.length >= event.limit) {
      event.freezeUntil = now + Number(event.freezeDuration);
      this.emit("update", { type: "freeze", event });
      return { status: "wait", waitTime: Number(event.freezeDuration) / 1000 };
    }

    const token = uuidv4();
    event.users.push({ userId, token, joinedAt: now });

    if (event.users.length >= event.limit) {
      event.freezeUntil = now + Number(event.freezeDuration);
    }

    this.emit("update", { type: "join", event, userId });
    return { status: "joined", token };
  }

  async getQueueStatus(eventName, orgId) {
    const key = this._getKey(eventName, orgId);
    const event = this.events[key];
    if (!event) return null;

    const now = Date.now();
    if (event.freezeUntil && event.freezeUntil <= now) event.freezeUntil = null;

    return {
      ...event,
      waitTime: event.freezeUntil
        ? Math.ceil((event.freezeUntil - now) / 1000)
        : 0,
    };
  }
}

// ✅ ESM export
export default QueueManager;
