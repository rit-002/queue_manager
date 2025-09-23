const { v4: uuidv4 } = require("uuid");

class QueueManager {
  constructor(defaultWaitTime = 30) {
    this.queues = {};
    this.defaultWaitTime = defaultWaitTime;
  }

  createQueue(eventId, orgId, limit = 100, description = "") {
    const key = `${eventId}_${orgId}`;
    if (!this.queues[key]) {
      this.queues[key] = {
        limit,
        description,
        users: [],
      };
    }
    return this.queues[key];
  }

  joinQueue(eventId, orgId, userId) {
    const key = `${eventId}_${orgId}`;
    if (!this.queues[key]) throw new Error("Queue not found");

    const queue = this.queues[key];

    if (queue.users.find((u) => u.userId === userId)) {
      return { status: "already", userId };
    }

    if (queue.users.length < queue.limit) {
      const token = uuidv4();
      queue.users.push({ userId, token, joinedAt: Date.now() });
      return { status: "joined", token };
    }

    return { status: "wait", waitTime: this.defaultWaitTime };
  }

  getQueueStatus(eventId, orgId) {
    const key = `${eventId}_${orgId}`;
    return this.queues[key] || null;
  }

  resetQueue(eventId, orgId) {
    const key = `${eventId}_${orgId}`;
    delete this.queues[key];
    return true;
  }
}

module.exports = QueueManager;
