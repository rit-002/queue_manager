const { v4: uuidv4 } = require("uuid");
const { MongoClient } = require("mongodb");
const EventEmitter = require("events");

class QueueManager extends EventEmitter {
  constructor(
    dbUrl = process.env.MONGO_URL ||
      "mongodb+srv://ritesh_db_user:ySzqFbpURrohewxj@cluster0.pjcwvzl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    dbName = process.env.DB_NAME || "queue-manager"
  ) {
    super();
    this.client = new MongoClient(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
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

      // 🔹 Setup real-time listeners
      this.users.watch().on("change", (change) => {
        if (change.operationType === "insert") {
          this.emit("userJoined", change.fullDocument);
        } else if (change.operationType === "delete") {
          this.emit("userLeft", change.documentKey._id);
        }
      });

      this.events.watch().on("change", (change) => {
        if (change.operationType === "update") {
          this.emit("queueUpdated", change.updateDescription.updatedFields);
        }
      });
    }
  }

  // ✅ Create queue
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
      freezeUntil: null,
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

  // ✅ Join queue
  async joinQueue(eventName, orgId, userId) {
    await this.connect();

    const event = await this.events.findOne({ name: eventName, orgId });
    if (!event) throw new Error("Event not found");

    const already = await this.users.findOne({ eventId: event._id, userId });
    if (already) return { status: "already", userId };

    const now = new Date();

    if (event.freezeUntil && event.freezeUntil > now) {
      const remaining = Math.ceil((event.freezeUntil - now) / 1000);
      return { status: "wait", waitTime: remaining };
    }

    const count = await this.users.countDocuments({ eventId: event._id });

    if (count < event.limit) {
      const token = uuidv4();
      await this.users.insertOne({
        eventId: event._id,
        userId,
        token,
        joinedAt: now,
      });

      if (count + 1 >= event.limit) {
        await this.events.updateOne(
          { _id: event._id },
          { $set: { freezeUntil: new Date(now.getTime() + 30 * 1000) } }
        );
      }

      return { status: "joined", token };
    }

    await this.events.updateOne(
      { _id: event._id },
      { $set: { freezeUntil: new Date(now.getTime() + 30 * 1000) } }
    );
    return { status: "wait", waitTime: 30 };
  }

  // ✅ Get queue status
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

  // ✅ Reset queue
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
