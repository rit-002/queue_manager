const { v4: uuidv4 } = require("uuid");

class QueueManager {
  constructor(defaultWaitTime = 30) {
    this.queues = {};
    this.defaultWaitTime = defaultWaitTime; // wait time in seconds
  }

  createQueue(eventId, orgId, limit = 100, description = "") {
    const key = `${eventId}_${orgId}`;
    if (!this.queues[key]) {
      this.queues[key] = {
        limit,
        description,
        users: [],
        pendingUsers: [], // users waiting for timer
      };
    }
    return this.queues[key];
  }

  joinQueue(eventId, orgId, userId) {
    const key = `${eventId}_${orgId}`;
    if (!this.queues[key]) throw new Error("Queue not found");

    const queue = this.queues[key];

    // already in queue
    if (queue.users.find((u) => u.userId === userId)) {
      return { status: "already", userId };
    }

    // available slot
    if (queue.users.length < queue.limit) {
      const token = uuidv4();
      queue.users.push({ userId, token, joinedAt: Date.now() });
      return { status: "joined", token };
    }

    // queue full → add to pendingUsers and start timer
    if (!queue.pendingUsers.find((u) => u.userId === userId)) {
      queue.pendingUsers.push(userId);

      setTimeout(() => {
        // remove from pending
        queue.pendingUsers = queue.pendingUsers.filter((u) => u !== userId);
        console.log(`[QueueManager] User ${userId} can try joining again for ${key}`);
      }, this.defaultWaitTime * 1000);
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
