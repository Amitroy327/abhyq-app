const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/abhyq-memory.db");

console.log("MESSAGE TABLE STRUCTURE:");
console.log(db.prepare("PRAGMA table_info(conversation_messages)").all());

console.log("SAVED MESSAGES:");
console.log(db.prepare("SELECT * FROM conversation_messages ORDER BY rowid DESC LIMIT 10").all());
