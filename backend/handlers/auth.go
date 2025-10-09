package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"realtimeforum/backend/models"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	db *sql.DB
)

func SetDB(database *sql.DB) {
	db = database
}

func sendJSONResponse(w http.ResponseWriter, success bool, message string) {
	w.Header().Set("Content-Type", "application/json")
	response := models.Response{
		Success: success,
		Message: message,
	}
	json.NewEncoder(w).Encode(response)
}

func sendErrorResponse(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	response := models.Response{
		Success: false,
		Message: message,
	}
	json.NewEncoder(w).Encode(response)
}

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseMultipartForm(10 << 20)
	if err != nil {
		sendErrorResponse(w, "Error parsing form data: "+err.Error(), http.StatusBadRequest)
		return
	}

	data := models.RegistrationData{
		Username:           r.FormValue("username"),
		Email:              r.FormValue("email"),
		Password:           r.FormValue("password"),
		FullName:           r.FormValue("fullname"),
		Gender:             r.FormValue("gender"),
		DateOfBirth:        r.FormValue("dateOfBirth"),
		AccountDescription: r.FormValue("accountDescription"),
	}

	validationResult := ValidateRegistrationData(data)
	if !validationResult.IsValid {
		sendJSONResponse(w, false, validationResult.Message)
		return
	}

	age, err := calculateAge(data.DateOfBirth)
	if err != nil {
		sendJSONResponse(w, false, "Invalid date of birth")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(data.Password), bcrypt.DefaultCost)
	if err != nil {
		sendJSONResponse(w, false, "Error processing password")
		return
	}

	profilePicturePath, err := saveProfilePicture(r)
	if err != nil {
		sendJSONResponse(w, false, "Error processing profile picture: "+err.Error())
		return
	}

	names := strings.Fields(strings.TrimSpace(data.FullName))
	var firstName, lastName string
	if len(names) >= 1 {
		firstName = names[0]
	}
	if len(names) >= 2 {
		lastName = strings.Join(names[1:], " ")
	}

	res, err := db.Exec(`INSERT INTO users (
        username, email, password_hash, profile_picture, first_name, last_name, 
        age, gender, account_description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		data.Username, data.Email, string(hash), profilePicturePath, firstName, lastName,
		age, data.Gender, data.AccountDescription)

	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			dupResult := CheckForDuplicates(data.Email, data.Username)
			sendJSONResponse(w, false, dupResult.Message)
		} else {
			sendJSONResponse(w, false, "Failed to register user: "+err.Error())
		}
		return
	}

	userID, err := res.LastInsertId()
	if err != nil {
		sendJSONResponse(w, false, "Failed to get user ID")
		return
	}

	db.Exec(`
        INSERT INTO user_activity (user_id, first_seen, last_seen)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, userID)

	var user models.UserData
	err = db.QueryRow(`SELECT user_id, username, email, password_hash, profile_picture, 
		first_name, last_name, age, gender, account_description 
		FROM users WHERE user_id = ?`, userID).
		Scan(&user.UserID, &user.Username, &user.Email, &user.PasswordHash, &user.ProfilePicture,
			&firstName, &lastName, &user.Age, &user.Gender, &user.AccountDescription)
	if err != nil {
		sendJSONResponse(w, false, "Failed to fetch user data: "+err.Error())
		return
	}
	user.Name = strings.TrimSpace(firstName + " " + lastName)
	models.CurrentUser = user

	err = CreateSession(userID, data.Username, w)
	if err != nil {
		sendJSONResponse(w, false, "Registration successful but session creation failed")
		return
	}

	EmitNewUser(user)
	sendJSONResponse(w, true, "Registration successful!")
}

func saveProfilePicture(r *http.Request) (string, error) {
    err := r.ParseMultipartForm(10 << 20) // 10 MB
    if err != nil {
        return "", err
    }

    file, handler, err := r.FormFile("profile_picture")
    if err != nil {
        if err == http.ErrMissingFile {
            return "", nil // No file uploaded is OK
        }
        return "", err
    }
    defer file.Close()

    // Validate file size
    if handler.Size > 5<<20 { // 5MB
        return "", fmt.Errorf("file too large: max size is 5MB")
    }

    // Validate file type
    buff := make([]byte, 512)
    _, err = file.Read(buff)
    if err != nil {
        return "", err
    }

    filetype := http.DetectContentType(buff)
    if !strings.HasPrefix(filetype, "image/") {
        return "", fmt.Errorf("invalid file type: only images are allowed")
    }

    _, err = file.Seek(0, 0)
    if err != nil {
        return "", err
    }

    // Create uploads directory relative to your project root
    uploadDir := "frontend/assets/uploads/profile_pictures"
    if err := os.MkdirAll(uploadDir, 0755); err != nil {
        return "", err
    }

    // Generate unique filename
    fileExt := strings.TrimPrefix(strings.Split(handler.Header.Get("Content-Type"), "/")[1], "x-")
    if fileExt == "jpeg" {
        fileExt = "jpg"
    }
    filename := fmt.Sprintf("%d_%s.%s", time.Now().UnixNano(), GenerateRandomString(8), fileExt)
    filepath := filepath.Join(uploadDir, filename)

    // Create the file
    dst, err := os.Create(filepath)
    if err != nil {
        return "", err
    }
    defer dst.Close()

    // Copy the uploaded file to the destination
    _, err = io.Copy(dst, file)
    if err != nil {
        return "", err
    }

    // Return the URL path (not the filesystem path)
    return "/assets/uploads/profile_pictures/" + filename, nil
}

func GenerateRandomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func ValidateRegistrationData(data models.RegistrationData) models.ValidationResult {

	validations := []models.ValidationResult{
		ValidateUsername(data.Username),
		ValidateEmail(data.Email),
		ValidatePassword(data.Password),
		ValidateName(data.FullName),
		ValidateGender(data.Gender),
		ValidateAge(data.DateOfBirth),
		ValidateAccountDescription(data.AccountDescription),
	}

	for _, validation := range validations {
		if !validation.IsValid {
			return validation
		}
	}

	return CheckForDuplicates(data.Email, data.Username)
}

func ValidateUsername(username string) models.ValidationResult {
	if len(username) == 0 {
		return models.ValidationResult{IsValid: false, Message: "Username is required"}
	}
	if len(username) < 2 {
		return models.ValidationResult{IsValid: false, Message: "Username must be at least 2 characters"}
	}

	if len(username) > 20 {
		return models.ValidationResult{IsValid: false, Message: "Username must be less than 20 characters"}
	}

	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(username) {
		return models.ValidationResult{IsValid: false, Message: "Username can only contain letters, numbers, and underscores"}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func ValidateEmail(email string) models.ValidationResult {
	if email == "" {
		return models.ValidationResult{IsValid: false, Message: "Email is required"}
	}

	re := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	if !re.MatchString(email) {
		return models.ValidationResult{IsValid: false, Message: "Invalid email address format"}
	}

	if len(email) > 255 {
		return models.ValidationResult{IsValid: false, Message: "Email must be less than 255 characters"}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func ValidatePassword(password string) models.ValidationResult {
	if len(password) < 6 {
		return models.ValidationResult{IsValid: false, Message: "Password must be at least 6 characters"}
	}

	if len(password) > 50 {
		return models.ValidationResult{IsValid: false, Message: "Password must be less than 50 characters"}
	}

	requirementsMet := 0
	if regexp.MustCompile(`[a-z]`).MatchString(password) {
		requirementsMet++
	}
	if regexp.MustCompile(`[A-Z]`).MatchString(password) {
		requirementsMet++
	}
	if regexp.MustCompile(`[0-9]`).MatchString(password) {
		requirementsMet++
	}
	if regexp.MustCompile(`[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]`).MatchString(password) {
		requirementsMet++
	}

	if requirementsMet < 4 {
		return models.ValidationResult{
			IsValid: false,
			Message: "Password must contain : lowercase letters, uppercase letters, digits, special characters",
		}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func ValidateName(fullName string) models.ValidationResult {
	if strings.TrimSpace(fullName) == "" {
		return models.ValidationResult{IsValid: false, Message: "Full name is required"}
	}

	nameParts := strings.Fields(strings.TrimSpace(fullName))
	if len(nameParts) < 2 {
		return models.ValidationResult{IsValid: false, Message: "Please enter your full name (first and last name)"}
	}

	if !regexp.MustCompile(`^[a-zA-Z\s\-']+$`).MatchString(fullName) {
		return models.ValidationResult{IsValid: false, Message: "Full name can only contain letters, spaces, hyphens, and apostrophes"}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func ValidateGender(gender string) models.ValidationResult {
	if gender == "" {
		return models.ValidationResult{IsValid: false, Message: "Gender is required"}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func ValidateAge(dateOfBirth string) models.ValidationResult {
	if dateOfBirth == "" {
		return models.ValidationResult{IsValid: false, Message: "Date of birth is required"}
	}

	age, err := calculateAge(dateOfBirth)
	if err != nil {
		return models.ValidationResult{IsValid: false, Message: "Invalid date of birth"}
	}

	if age < 18 {
		return models.ValidationResult{IsValid: false, Message: "You must be at least 18 years old"}
	}

	if age > 120 {
		return models.ValidationResult{IsValid: false, Message: "Invalid date of birth"}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func calculateAge(dateOfBirth string) (int, error) {
	if dateOfBirth == "" {
		return 0, nil
	}

	dob, err := time.Parse("2006-01-02", dateOfBirth)
	if err != nil {
		return 0, err
	}

	now := time.Now()
	age := now.Year() - dob.Year()

	if now.YearDay() < dob.YearDay() {
		age--
	}

	return age, nil
}

func ValidateAccountDescription(description string) models.ValidationResult {
	if len(description) > 1000 {
		return models.ValidationResult{IsValid: false, Message: "Account description must be less than 1000 characters"}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func CheckForDuplicates(email, username string) models.ValidationResult {
	var emailExists int
	err := db.QueryRow("SELECT COUNT(*) FROM users WHERE email = ?", email).Scan(&emailExists)
	if err != nil {
		return models.ValidationResult{IsValid: false, Message: "Database error checking for duplicates"}
	}

	var usernameExists int
	err = db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&usernameExists)
	if err != nil {
		return models.ValidationResult{IsValid: false, Message: "Database error checking for duplicates"}
	}

	if emailExists > 0 {
		return models.ValidationResult{IsValid: false, Message: "Email already exists"}
	} else if usernameExists > 0 {
		return models.ValidationResult{IsValid: false, Message: "Username already exists"}
	}

	return models.ValidationResult{IsValid: true, Message: ""}
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendErrorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var data struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if r.ContentLength == 0 {
		sendErrorResponse(w, "Empty request body", http.StatusBadRequest)
		return
	}

	err := json.NewDecoder(r.Body).Decode(&data)
	if err != nil {
		sendErrorResponse(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	if data.Username == "" || data.Password == "" {
		sendJSONResponse(w, false, "Username and password are required")
		return
	}

	var userID int64
	var username string
	var passwordHash string
	err = db.QueryRow("SELECT user_id, username, password_hash FROM users WHERE username = ? OR email = ?",
		data.Username, data.Username).Scan(&userID, &username, &passwordHash)

	if err != nil {
		if err == sql.ErrNoRows {
			sendJSONResponse(w, false, "Invalid username or password")
			return
		}
		sendJSONResponse(w, false, "Database error: "+err.Error())
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(data.Password))
	if err != nil {
		sendJSONResponse(w, false, "Invalid username or password")
		return
	}

	db.Exec(`
        INSERT INTO user_activity (user_id, first_seen, last_seen)
    VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
        last_seen = CURRENT_TIMESTAMP;
    `, userID)

	var user models.UserData
	var firstName, lastName string
	err = db.QueryRow(`SELECT user_id, username, email, password_hash, profile_picture, 
		first_name, last_name, age, gender, account_description 
		FROM users WHERE username = ? OR email = ?`, data.Username, data.Username).
		Scan(&user.UserID, &user.Username, &user.Email, &user.PasswordHash, &user.ProfilePicture,
			&firstName, &lastName, &user.Age, &user.Gender, &user.AccountDescription)
	if err != nil {
		sendJSONResponse(w, false, "Failed to fetch user data: "+err.Error())
		return
	}
	user.Name = strings.TrimSpace(firstName + " " + lastName)
	models.CurrentUser = user

	err = CreateSession(userID, username, w)
	if err != nil {
		sendJSONResponse(w, false, "Failed to create session: "+err.Error())
		return
	}
	// After session creation in LoginHandler, add:
	EmitUserLoggedIn(int(userID), username)
	sendJSONResponse(w, true, "Login successful!")
}

func SessionHandler(w http.ResponseWriter, r *http.Request) {
	session, err := GetSession(r)
	if err != nil {
		sendJSONResponse(w, false, "")
		return
	}
	sendJSONResponse(w, true, session.Username)
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	session, err1 := GetSession(r)
	if err1 != nil {
		sendJSONResponse(w, false, "No active session")
		return
	}

	userID := session.UserID

	db.Exec(`
        UPDATE user_activity
    SET last_seen = CURRENT_TIMESTAMP
    WHERE user_id = ?;
    `, userID)

	// Before session deletion in LogoutHandler, add:
	EmitUserLoggedOut(int(userID), session.Username)
	err := DeleteSession(w, r)
	if err != nil {
		sendJSONResponse(w, false, "Logout failed: "+err.Error())
		return
	}

	sendJSONResponse(w, true, "Logged out successfully")
}
