package handlers

import (
	"encoding/json"
	"net/http"
)

// Unread counts API handlers
// Get unread counts for all conversations
func GetUnreadCountsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sess, err := GetSession(r)
	if err != nil || sess == nil {
		sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := db.Query(`
		SELECT other_user_id, unread_count 
		FROM unread_message_counts 
		WHERE user_id = ? AND unread_count > 0
	`, sess.UserID)
	
	if err != nil {
		// Return empty array instead of error
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"counts":  []interface{}{},
		})
		return
	}
	defer rows.Close()

	type UnreadCount struct {
		OtherUserID int `json:"other_user_id"`
		UnreadCount int `json:"unread_count"`
	}

	var counts []UnreadCount
	for rows.Next() {
		var count UnreadCount
		err := rows.Scan(&count.OtherUserID, &count.UnreadCount)
		if err != nil {
			continue
		}
		counts = append(counts, count)
	}

	// Always return an array, even if empty
	if counts == nil {
		counts = []UnreadCount{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"counts":  counts,
	})
}

func MarkMessagesReadHandler(w http.ResponseWriter, r *http.Request) {
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
		OtherUserID int `json:"other_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Start transaction
	tx, err := db.Begin()
	if err != nil {
		sendErrorResponse(w, "Failed to start transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Update conversation read time
	_, err = tx.Exec(`
		INSERT OR REPLACE INTO conversation_read_times (user_id, other_user_id, last_read_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
	`, sess.UserID, req.OtherUserID)

	if err != nil {
		sendErrorResponse(w, "Failed to update read time: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Reset unread count for this conversation
	_, err = tx.Exec(`
		UPDATE unread_message_counts 
		SET unread_count = 0, last_updated = CURRENT_TIMESTAMP
		WHERE user_id = ? AND other_user_id = ?
	`, sess.UserID, req.OtherUserID)

	if err != nil {
		sendErrorResponse(w, "Failed to reset unread count: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Also mark individual messages as read in private_messages table
	_, err = tx.Exec(`
		UPDATE private_messages 
		SET is_read = TRUE 
		WHERE to_user_id = ? AND from_user_id = ? AND is_read = FALSE
	`, sess.UserID, req.OtherUserID)

	if err != nil {
		sendErrorResponse(w, "Failed to mark messages as read: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		sendErrorResponse(w, "Failed to commit transaction: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func IncrementUnreadCountHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		UserID      int `json:"user_id"`
		OtherUserID int `json:"other_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendErrorResponse(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	_, err := db.Exec(`
		INSERT INTO unread_message_counts (user_id, other_user_id, unread_count, last_updated)
		VALUES (?, ?, 1, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id, other_user_id) 
		DO UPDATE SET 
			unread_count = unread_count + 1,
			last_updated = CURRENT_TIMESTAMP
	`, req.UserID, req.OtherUserID)

	if err != nil {
		sendErrorResponse(w, "Failed to increment unread count: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}