import { v4 as uuidv4 } from "uuid";
import EventEmitter from "events";
import Redis from "ioredis";

class QueueManager extends EventEmitter {
  constructor(redisOptions = {}) {
    super();
    this.redis = new Redis(redisOptions);
    this.defaultFreeze = 30; // freeze in seconds
  }

  _queueKey(eventId) {
    return `queue:${eventId}:users`;
  }

  _freezeKey(eventId) {
    return `queue:${eventId}:freeze`;
  }

  /**
   * Create a queue (sets initial empty list if not exists)
   */
  async createQueue(eventId, name, limit = 1) {
    const exists = await this.redis.exists(this._queueKey(eventId));
    if (!exists) {
      await this.redis.hmset(`queue:${eventId}:meta`, { name, limit });
      await this.redis.del(this._queueKey(eventId)); // start empty
      this.emit("queueCreated", { eventId, name, limit });
    } else {
      throw new Error("Queue already exists.");
    }
  }

  /**
   * Join queue
   */
  async joinQueue(eventId, user) {
    const freeze = await this.redis.ttl(this._freezeKey(eventId));
    if (freeze > 0) {
      throw new Error(`Queue is frozen. Try again in ${freeze} sec.`);
    }

    const meta = await this.redis.hgetall(`queue:${eventId}:meta`);
    if (!meta || !meta.limit) throw new Error("Queue does not exist.");

    const users = await this.redis.lrange(this._queueKey(eventId), 0, -1);

    if (users.length >= parseInt(meta.limit)) {
      // set freeze
      await this.redis.set(
        this._freezeKey(eventId),
        1,
        "EX",
        this.defaultFreeze
      );
      throw new Error(
        `Queue limit reached. Try again in ${this.defaultFreeze} sec.`
      );
    }

    const token = uuidv4();
    const joinedAt = new Date().toISOString();
    const userRecord = { ...user, token, joinedAt };

    await this.redis.rpush(this._queueKey(eventId), JSON.stringify(userRecord));

    this.emit("userJoined", {
      eventId,
      user: userRecord,
      currentUsers: users.length + 1,
    });

    return userRecord;
  }

  /**
   * Leave queue
   */
  async leaveQueue(eventId, token) {
    const users = await this.redis.lrange(this._queueKey(eventId), 0, -1);
    let userToRemove = null;

    for (let u of users) {
      const userObj = JSON.parse(u);
      if (userObj.token === token) {
        userToRemove = u;
        break;
      }
    }

    if (!userToRemove) throw new Error("User not in queue.");

    await this.redis.lrem(this._queueKey(eventId), 1, userToRemove);
    this.emit("userLeft", { eventId, token });
    return JSON.parse(userToRemove);
  }

  /**
   * Get queue status
   */
  async getQueueStatus(eventId) {
    const users = await this.redis.lrange(this._queueKey(eventId), 0, -1);
    const meta = await this.redis.hgetall(`queue:${eventId}:meta`);
    const freeze = await this.redis.ttl(this._freezeKey(eventId));

    return {
      name: meta.name,
      limit: parseInt(meta.limit),
      users: users.map((u) => JSON.parse(u)),
      freezeUntil: freeze > 0 ? Date.now() + freeze * 1000 : null,
    };
  }
}

export default QueueManager;
