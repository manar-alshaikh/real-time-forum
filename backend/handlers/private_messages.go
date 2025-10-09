package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

type PrivateMessage struct {
	ID             int    `json:"id"`
	FromUserID     int    `json:"from_user_id"`
	ToUserID       int    `json:"to_user_id"`
	Content        string `json:"content"`
	MessageType    string `json:"message_type"`
	IsRead         bool   `json:"is_read"`
	CreatedAt      string `json:"created_at"`
	Username       string `json:"username,omitempty"`
	ProfilePicture string `json:"profile_picture,omitempty"`
}

type SendMessageRequest struct {
	ToUserID    int    `json:"to_user_id"`
	Content     string `json:"content"`
	MessageType string `json:"message_type"`
}

// Get private messages between two users with pagination
func GetPrivateMessagesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sess, err := GetSession(r)
	if err != nil || sess == nil {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Get query parameters
	targetUserIDStr := r.URL.Query().Get("target_user_id")
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	targetUserID, err := strconv.Atoi(targetUserIDStr)
	if err != nil {
		sendErrorResponse(w, "Invalid target user ID", http.StatusBadRequest)
		return
	}

	// Parse pagination parameters with defaults
	page := 1
	if pageStr != "" {
		page, _ = strconv.Atoi(pageStr)
	}
	if page < 1 {
		page = 1
	}

	limit := 20 // Default limit
	if limitStr != "" {
		if customLimit, err := strconv.Atoi(limitStr); err == nil && customLimit > 0 {
			limit = customLimit
		}
	}
	if limit > 50 { // Maximum limit to prevent abuse
		limit = 50
	}

	offset := (page - 1) * limit

	// Get messages between the two users
	rows, err := db.Query(`
		SELECT 
			pm.id, pm.from_user_id, pm.to_user_id, pm.content, 
			pm.message_type, pm.is_read, pm.created_at,
			u.username, u.profile_picture
		FROM private_messages pm
		JOIN users u ON pm.from_user_id = u.user_id
		WHERE (pm.from_user_id = ? AND pm.to_user_id = ?) 
		   OR (pm.from_user_id = ? AND pm.to_user_id = ?)
		ORDER BY pm.created_at DESC
		LIMIT ? OFFSET ?
	`, sess.UserID, targetUserID, targetUserID, sess.UserID, limit, offset)
	
	if err != nil {
		sendErrorResponse(w, "Failed to fetch messages: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []PrivateMessage
	for rows.Next() {
		var msg PrivateMessage
		var profilePicture sql.NullString
		var createdAt time.Time
		
		err := rows.Scan(
			&msg.ID, &msg.FromUserID, &msg.ToUserID, &msg.Content,
			&msg.MessageType, &msg.IsRead, &createdAt,
			&msg.Username, &profilePicture,
		)
		if err != nil {
			continue
		}
		
		// Format the timestamp properly
		msg.CreatedAt = createdAt.Format(time.RFC3339)
		
		if profilePicture.Valid {
			msg.ProfilePicture = profilePicture.String
		}
		
		messages = append(messages, msg)
	}

	// For pagination, we return messages in chronological order (oldest first)
	// This makes it easier for the frontend to handle
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	// Check if there are more messages
	hasMore := len(messages) == limit

	// Mark messages as read (only for the latest page)
	if page == 1 && len(messages) > 0 {
		go markMessagesAsRead(int(sess.UserID), targetUserID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"messages": messages,
		"page":     page,
		"hasMore":  hasMore,
		"limit":    limit,
	})
}

// Send a private message
func SendPrivateMessageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sess, err := GetSession(r)
	if err != nil || sess == nil {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Content == "" {
		sendErrorResponse(w, "Message content cannot be empty", http.StatusBadRequest)
		return
	}

	if req.MessageType == "" {
		req.MessageType = "text"
	}

	// Insert message into database
	result, err := db.Exec(`
		INSERT INTO private_messages (from_user_id, to_user_id, content, message_type)
		VALUES (?, ?, ?, ?)
	`, sess.UserID, req.ToUserID, req.Content, req.MessageType)

	if err != nil {
		sendErrorResponse(w, "Failed to send message: "+err.Error(), http.StatusInternalServerError)
		return
	}

	messageID, _ := result.LastInsertId()

	// Get the created message with user info
	var sentMessage PrivateMessage
	var profilePicture sql.NullString
	var createdAt time.Time

	err = db.QueryRow(`
		SELECT pm.id, pm.from_user_id, pm.to_user_id, pm.content, 
		       pm.message_type, pm.is_read, pm.created_at,
		       u.username, u.profile_picture
		FROM private_messages pm
		JOIN users u ON pm.from_user_id = u.user_id
		WHERE pm.id = ?
	`, messageID).Scan(
		&sentMessage.ID, &sentMessage.FromUserID, &sentMessage.ToUserID, &sentMessage.Content,
		&sentMessage.MessageType, &sentMessage.IsRead, &createdAt,
		&sentMessage.Username, &profilePicture,
	)

	if err != nil {
		sendErrorResponse(w, "Message sent but failed to retrieve: "+err.Error(), http.StatusInternalServerError)
		return
	}

	sentMessage.CreatedAt = createdAt.Format(time.RFC3339)
	if profilePicture.Valid {
		sentMessage.ProfilePicture = profilePicture.String
	}

	// ONLY emit the new message to the RECIPIENT, not back to the sender
	// The sender already has the message via the API response
	EmitToUser(req.ToUserID, "new_private_message", sentMessage)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": sentMessage,
	})

	// EmitToUser(req.ToUserID, "new_private_message", sentMessage)

}

// Typing indicator handlers
func StartTypingHandler(w http.ResponseWriter, r *http.Request) {
	handleTypingIndicator(w, r, true)
}

func StopTypingHandler(w http.ResponseWriter, r *http.Request) {
	handleTypingIndicator(w, r, false)
}

func handleTypingIndicator(w http.ResponseWriter, r *http.Request, isTyping bool) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sess, err := GetSession(r)
	if err != nil || sess == nil {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		ToUserID int `json:"to_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Emit typing indicator via WebSocket
	typingData := map[string]interface{}{
		"from_user_id": sess.UserID,
		"username":     sess.Username,
		"is_typing":    isTyping,
	}

	EmitToUser(req.ToUserID, "user_typing", typingData)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// Helper function to mark messages as read
func markMessagesAsRead(userID, fromUserID int) {
	db.Exec(`
		UPDATE private_messages 
		SET is_read = TRUE 
		WHERE to_user_id = ? AND from_user_id = ? AND is_read = FALSE
	`, userID, fromUserID)
}

// Helper function to emit to specific user
func EmitToUser(userID int, eventType string, data interface{}) {
	// This would need to be integrated with your WebSocket hub
	// to send messages to specific users
	msg, err := json.Marshal(map[string]interface{}{
		"type": eventType,
		"data": data,
	})
	if err != nil {
		return
	}

	// You'll need to implement user-specific broadcasting in your hub
	// For now, we'll use the existing broadcast
	if realtimeHub != nil {
		 realtimeHub.SendToUser(userID, msg)
	}
}