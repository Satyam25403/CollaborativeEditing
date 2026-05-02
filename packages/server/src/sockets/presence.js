// In-memory presence map: roomId -> Map<userId, userObject>
// FIX BUG 13: this module is now correctly wired into hocuspocusServer.js
//             onConnect / onDisconnect hooks so join/leave events are tracked.
// For multi-process production deployments, replace with Redis pub/sub.
const rooms = new Map();

/**
 * Record that a user has joined a room.
 * @param {string} roomId
 * @param {{ _id: string, name: string, avatarColor?: string }} user
 */
function userJoined(roomId, user) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  rooms.get(roomId).set(user._id.toString(), {
    _id:        user._id,
    name:       user.name,
    avatarColor: user.avatarColor || null,
    joinedAt:   Date.now()
  });
}

/**
 * Record that a user has left a room.
 * @param {string} roomId
 * @param {string} userId
 */
function userLeft(roomId, userId) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).delete(userId.toString());
    if (rooms.get(roomId).size === 0) rooms.delete(roomId);
  }
}

/**
 * Get the list of users currently in a room.
 * @param {string} roomId
 * @returns {Array}
 */
function getPresence(roomId) {
  if (!rooms.has(roomId)) return [];
  return Array.from(rooms.get(roomId).values());
}

/**
 * Get a snapshot of all rooms and their current users.
 * @returns {Object}
 */
function getAllRooms() {
  const result = {};
  for (const [roomId, users] of rooms.entries()) {
    result[roomId] = Array.from(users.values());
  }
  return result;
}

module.exports = { userJoined, userLeft, getPresence, getAllRooms };