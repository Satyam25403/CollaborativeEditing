// In-memory presence map: roomId -> Set of user objects
// For production replace with Redis pub/sub
const rooms = new Map();

function userJoined(roomId, user) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  rooms.get(roomId).set(user._id.toString(), {
    _id: user._id,
    name: user.name,
    avatarColor: user.avatarColor,
    joinedAt: Date.now()
  });
}

function userLeft(roomId, userId) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).delete(userId.toString());
    if (rooms.get(roomId).size === 0) rooms.delete(roomId);
  }
}

function getPresence(roomId) {
  if (!rooms.has(roomId)) return [];
  return Array.from(rooms.get(roomId).values());
}

function getAllRooms() {
  const result = {};
  for (const [roomId, users] of rooms.entries()) {
    result[roomId] = Array.from(users.values());
  }
  return result;
}

module.exports = { userJoined, userLeft, getPresence, getAllRooms };