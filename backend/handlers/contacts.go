package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"realtimeforum/backend/models"
)

type Contact struct {
	UserID         int    `json:"user_id"`
	Username       string `json:"username"`
	ProfilePicture string `json:"profile_picture"`
	IsOnline       bool   `json:"is_online"`
	LastSeen       string `json:"last_seen,omitempty"`
	LastMessageTime string `json:"last_message_time,omitempty"`
}

// Get all users for contacts list with last message info
func GetAllUsersHandler(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    sess, err := GetSession(r)
    if err != nil || sess == nil {
        sendErrorResponse(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    // Get contacts with last message timestamp
    rows, err := db.Query(`
        SELECT 
            u.user_id, 
            u.username, 
            COALESCE(u.profile_picture, '') as profile_picture,
            CASE 
                WHEN s.session_id IS NOT NULL AND s.expires_at > datetime('now') THEN 1 
                ELSE 0 
            END as is_online,
            COALESCE(MAX(pm.created_at), '') as last_message_time
        FROM users u
        LEFT JOIN sessions s ON u.user_id = s.user_id AND s.expires_at > datetime('now')
        LEFT JOIN private_messages pm ON (
            (pm.from_user_id = u.user_id AND pm.to_user_id = ?) OR 
            (pm.from_user_id = ? AND pm.to_user_id = u.user_id)
        )
        WHERE u.user_id != ?
        GROUP BY u.user_id
        ORDER BY 
            CASE WHEN MAX(pm.created_at) IS NOT NULL THEN 1 ELSE 0 END DESC,
            MAX(pm.created_at) DESC,
            u.username ASC
    `, sess.UserID, sess.UserID, sess.UserID)
    
    if err != nil {
        sendErrorResponse(w, "Failed to fetch users: "+err.Error(), http.StatusInternalServerError)
        return
    }
    defer rows.Close()

    var contacts []Contact
    for rows.Next() {
        var contact Contact
        var lastMessageTime sql.NullString
        
        err := rows.Scan(
            &contact.UserID, 
            &contact.Username, 
            &contact.ProfilePicture, 
            &contact.IsOnline, 
            &lastMessageTime,
        )
        if err != nil {
            continue
        }
        
        if lastMessageTime.Valid {
            contact.LastMessageTime = lastMessageTime.String
        }
        
        contacts = append(contacts, contact)
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success":  true,
        "contacts": contacts,
    })
}

// Emit new user to all connected clients when someone registers
func EmitNewUser(user models.UserData) {
	contact := Contact{
		UserID:         user.UserID,
		Username:       user.Username,
		ProfilePicture: user.ProfilePicture,
		IsOnline:       true, // Newly registered users are considered online
	}

	Emit("user_registered", contact)
}

// Emit user online status when someone logs in
func EmitUserLoggedIn(userID int, username string) {
	Emit("user_online_status", map[string]interface{}{
		"user_id":  userID,
		"username": username,
		"is_online": true,
	})
}

// Emit user offline status when someone logs out
func EmitUserLoggedOut(userID int, username string) {
	Emit("user_online_status", map[string]interface{}{
		"user_id":  userID,
		"username": username,
		"is_online": false,
	})
}