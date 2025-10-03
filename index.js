const QueueManager = require("./src/queue");
const queue = new QueueManager();

(async () => {
  await queue.createQueue("myEvent", "org1", 2, "Test Event");
  console.log(await queue.joinQueue("myEvent", "org1", "user1"));
  console.log(await queue.joinQueue("myEvent", "org1", "user2"));
  console.log(await queue.joinQueue("myEvent", "org1", "user3"));
  console.log(await queue.getQueueStatus("myEvent", "org1"));
})();
