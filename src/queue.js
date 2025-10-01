const { v4: uuidv4 } = require("uuid");
const { MongoClient, ObjectId } = require("mongodb");

class QueueManager {
  constructor(dbUrl = "mongodb://127.0.0.1:27017", dbName = "queue-manager") {
    this.client = new MongoClient(dbUrl);
    this.dbName = dbName;
    this.connected = false;
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.events = this.db.collection("events");
      this.users = this.db.collection("queueUsers");
      this.connected = true;
    }
  }

  // Create an event queue
  async createQueue(eventName, orgId, limit = 100, description = "") {
    await this.connect();
    const existing = await this.events.findOne({ name: eventName, orgId });
    if (existing) return existing;

    const result = await this.events.insertOne({
      name: eventName,
      orgId,
      limit,
      description,
      createdAt: new Date(),
      freezeUntil: null, // for 30 sec freeze
    });

    return {
      _id: result.insertedId,
      name: eventName,
      orgId,
      limit,
      description,
      freezeUntil: null,
    };
  }

  // Join a queue
  async joinQueue(eventName, orgId, userId) {
    await this.connect();

    const event = await this.events.findOne({ name: eventName, orgId });
    if (!event) throw new Error("Event not found");

    // Check if user already in queue
    const already = await this.users.findOne({ eventId: event._id, userId });
    if (already) return { status: "already", userId };

    const now = new Date();

    // Check if queue is frozen
    if (event.freezeUntil && event.freezeUntil > now) {
      const remaining = Math.ceil((event.freezeUntil - now) / 1000);
      return { status: "wait", waitTime: remaining };
    }

    // Count current users
    const count = await this.users.countDocuments({ eventId: event._id });

    if (count < event.limit) {
      const token = uuidv4();
      await this.users.insertOne({
        eventId: event._id,
        userId,
        token,
        joinedAt: now,
      });

      // If queue reaches limit, set freeze for 30 seconds
      if (count + 1 >= event.limit) {
        await this.events.updateOne(
          { _id: event._id },
          { $set: { freezeUntil: new Date(now.getTime() + 30 * 1000) } }
        );
      }

      return { status: "joined", token };
    }

    // If somehow over limit, enforce freeze
    await this.events.updateOne(
      { _id: event._id },
      { $set: { freezeUntil: new Date(now.getTime() + 30 * 1000) } }
    );
    return { status: "wait", waitTime: 30 };
  }

  // Get queue status
  async getQueueStatus(eventName, orgId) {
    await this.connect();
    const event = await this.events.findOne({ name: eventName, orgId });
    if (!event) return null;

    const users = await this.users.find({ eventId: event._id }).toArray();
    const now = new Date();
    let waitTime = 0;

    if (event.freezeUntil && event.freezeUntil > now) {
      waitTime = Math.ceil((event.freezeUntil - now) / 1000);
    }

    return { ...event, users, waitTime };
  }

  // Reset a queue
  async resetQueue(eventName, orgId) {
    await this.connect();
    const event = await this.events.findOne({ name: eventName, orgId });
    if (!event) return false;

    await this.users.deleteMany({ eventId: event._id });
    await this.events.deleteOne({ _id: event._id });
    return true;
  }
}

module.exports = QueueManager;
