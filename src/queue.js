import { v4 as uuidv4 } from "uuid";
import EventEmitter from "events";

class QueueManager extends EventEmitter {
  constructor() {
    super();
    this.queues = {}; // { "eventId": { name, limit, freezeUntil, users: [] } }
    this.defaultFreeze = 30 * 1000; // 30 seconds
  }

  _getQueueKey(eventId) {
    return `queue:${eventId}`;
  }

  createQueue(eventId, name, limit = 1) {
    const key = this._getQueueKey(eventId);
    if (this.queues[key]) throw new Error("Queue already exists.");
    this.queues[key] = { name, limit, freezeUntil: null, users: [] };
    this.emit("queueCreated", { eventId, name, limit });
    return this.queues[key];
  }

  joinQueue(eventId, user) {
    const key = this._getQueueKey(eventId);
    const queue = this.queues[key];
    if (!queue) throw new Error("Queue does not exist.");

    const now = Date.now();
    if (queue.freezeUntil && now < queue.freezeUntil) {
      const waitTime = Math.ceil((queue.freezeUntil - now) / 1000);
      throw new Error(`Queue frozen. Try again in ${waitTime} sec.`);
    }

    if (queue.users.length >= queue.limit) {
      queue.freezeUntil = now + this.defaultFreeze;
      throw new Error("Queue limit reached. Try after 30 sec.");
    }

    const token = uuidv4();
    const joinedAt = new Date().toISOString();
    const userRecord = { ...user, token, joinedAt };
    queue.users.push(userRecord);

    this.emit("userJoined", {
      eventId,
      user: userRecord,
      currentUsers: queue.users.length,
    });

    return userRecord;
  }

  leaveQueue(eventId, token) {
    const key = this._getQueueKey(eventId);
    const queue = this.queues[key];
    if (!queue) throw new Error("Queue does not exist.");

    const index = queue.users.findIndex((u) => u.token === token);
    if (index === -1) throw new Error("User not in queue.");

    const [user] = queue.users.splice(index, 1);
    this.emit("userLeft", { eventId, user, currentUsers: queue.users.length });

    return user;
  }

  getQueueStatus(eventId) {
    const key = this._getQueueKey(eventId);
    const queue = this.queues[key];
    if (!queue) throw new Error("Queue does not exist.");
    return queue;
  }
}

export default QueueManager;
