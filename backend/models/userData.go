package models

var CurrentUser UserData

type UserData struct {
	UserID             int    `json:"user_id"`
	Username           string `json:"username"`
	Email              string `json:"email"`
	PasswordHash       string `json:"password_hash"`
	ProfilePicture     string `json:"profile_picture"`
	Name               string `json:"name"`
	Age                int    `json:"age"`
	Gender             string `json:"gender"`
	AccountDescription string `json:"account_description"`
}

type RegistrationData struct {
	Username           string `json:"username"`
	Email              string `json:"email"`
	Password           string `json:"password"`
	FullName           string `json:"fullname"`
	DateOfBirth        string `json:"date_of_birth"`
	Gender             string `json:"gender"`
	AccountDescription string `json:"account_description"`
}

type Response struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type ValidationResult struct {
	IsValid bool   `json:"is_valid"`
	Message string `json:"message"`
}
