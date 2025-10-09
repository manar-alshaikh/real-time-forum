package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
)

type ProfileResponse struct {
	Success bool        `json:"success"`
	Data    *UserProfile `json:"data"`
}

type UserProfile struct {
	UserID      int    `json:"user_id"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	ProfilePicture string `json:"profile_picture"`
	Name        string `json:"name"`
	Age         int    `json:"age"`
	Gender      string `json:"gender"`
	Description string `json:"description"`
}

// GET /api/profile -> current logged-in user's profile
func ProfileHandler(w http.ResponseWriter, r *http.Request) {
	sess, err := GetSession(r)
	if err != nil || sess == nil {
		// Return success with no data for unauthenticated users
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ProfileResponse{
			Success: true,
			Data:    nil,
		})
		return
	}

	// Query users table with your actual column names
	var profile UserProfile
	var firstName, lastName string
	
	err = db.QueryRow(`
		SELECT user_id, username, email, profile_picture, 
		       first_name, last_name, age, gender, account_description 
		FROM users WHERE user_id = ?`, sess.UserID).
		Scan(&profile.UserID, &profile.Username, &profile.Email, &profile.ProfilePicture,
			&firstName, &lastName, &profile.Age, &profile.Gender, &profile.Description)
	
	if err != nil {
		// User not found but session exists - clear session and return no data
		DeleteSession(w, r)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ProfileResponse{
			Success: true,
			Data:    nil,
		})
		return
	}

	profile.Name = strings.TrimSpace(firstName + " " + lastName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ProfileResponse{
		Success: true,
		Data:    &profile,
	})
}