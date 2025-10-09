package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type TestUser struct {
	Username string
	Password string
	Email    string
	FullName string
	Age      int
	Gender   string
	About    string
}

func InsertTestUsers(db *sql.DB) error {
	users := generateUsersAtoK()

	insertStmt, err := db.Prepare(`
INSERT INTO users (
	username, email, password_hash, profile_picture, first_name, last_name, 
	age, gender, account_description
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
	if err != nil {
		return fmt.Errorf("failed to prepare insert statement: %v", err)
	}
	defer insertStmt.Close()

	activityStmt, _ := db.Prepare(`
INSERT INTO user_activity (user_id, first_seen, last_seen) 
VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`)
	if activityStmt != nil {
		defer activityStmt.Close()
	}

	for _, u := range users {
		var exists int
		err := db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", u.Username).Scan(&exists)
		if err != nil {
			log.Printf("Check failed for user %s: %v", u.Username, err)
			continue
		}
		if exists > 0 {
			continue
		}

		hash, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Error hashing password for %s: %v", u.Username, err)
			continue
		}

		names := strings.Fields(u.FullName)
		firstName, lastName := "", ""
		if len(names) > 0 {
			firstName = names[0]
		}
		if len(names) > 1 {
			lastName = strings.Join(names[1:], " ")
		}

		res, err := insertStmt.Exec(
			u.Username,
			u.Email,
			string(hash),
			"/assets/uploads/profile_pictures/default.png",
			firstName,
			lastName,
			u.Age,
			u.Gender,
			u.About,
		)
		if err != nil {
			log.Printf("Insert failed for %s: %v", u.Username, err)
			continue
		}

		userID, err := res.LastInsertId()
		if err == nil && activityStmt != nil {
			_, _ = activityStmt.Exec(userID)
		}
	}

	return nil
}

func generateUsersAtoK() []TestUser {
	var users []TestUser
	for r := 'A'; r <= 'K'; r++ {
		u := string(r)
		users = append(users, TestUser{
			Username: u,
			Password: u,
			Email:    fmt.Sprintf("%s@example.test", strings.ToLower(u)),
			FullName: fmt.Sprintf("User %s", u),
			Age:      25,
			Gender:   "female",
			About:    fmt.Sprintf("Test account %s", u),
		})
	}
	return users
}
