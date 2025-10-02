import { v4 as uuidv4 } from "uuid";
import Redis from "ioredis";

class QueueManager {
  constructor() {
    this.redis = new Redis(); // default localhost:6379
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
    const exists = await this.redis.hgetall(key);

    if (exists.name) return exists; // already created

    const event = {
      name: eventName,
      orgId,
      limit,
      description,
      createdAt: Date.now(),
      freezeUntil: null,
      freezeDuration: freezeDuration || this.defaultFreeze,
    };

    await this.redis.hset(key, event);
    await this.redis.set(`${key}:users`, JSON.stringify([]));
    return event;
  }

  async joinQueue(eventName, orgId, userId) {
    const key = this._getKey(eventName, orgId);
    const event = await this.redis.hgetall(key);
    if (!event.name) throw new Error("Event not found");

    const now = Date.now();

    // cleanup freeze
    if (event.freezeUntil && Number(event.freezeUntil) <= now) {
      event.freezeUntil = null;
    }

    if (event.freezeUntil && Number(event.freezeUntil) > now) {
      const remaining = Math.ceil((event.freezeUntil - now) / 1000);
      return { status: "wait", waitTime: remaining };
    }

    let users = JSON.parse(await this.redis.get(`${key}:users`)) || [];

    // already joined
    if (users.find((u) => u.userId === userId)) {
      return { status: "already", userId };
    }

    if (users.length >= event.limit) {
      event.freezeUntil = now + Number(event.freezeDuration);
      await this.redis.hset(key, event);
      return { status: "wait", waitTime: Number(event.freezeDuration) / 1000 };
    }

    // join
    const token = uuidv4();
    users.push({ userId, token, joinedAt: now });
    await this.redis.set(`${key}:users`, JSON.stringify(users));

    if (users.length >= event.limit) {
      event.freezeUntil = now + Number(event.freezeDuration);
      await this.redis.hset(key, event);
    }

    return { status: "joined", token };
  }

  async getQueueStatus(eventName, orgId) {
    const key = this._getKey(eventName, orgId);
    const event = await this.redis.hgetall(key);
    if (!event.name) return null;

    let users = JSON.parse(await this.redis.get(`${key}:users`)) || [];
    const now = Date.now();

    if (event.freezeUntil && Number(event.freezeUntil) <= now) {
      event.freezeUntil = null;
    }

    let waitTime = 0;
    if (event.freezeUntil) {
      waitTime = Math.ceil((event.freezeUntil - now) / 1000);
    }

    return { ...event, users, waitTime };
  }
}

export default QueueManager;
