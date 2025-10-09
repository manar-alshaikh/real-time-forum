package ws

import ("time")

type User struct {
    UserID           int64     `json:"user_id"`           
    Nickname         string    `json:"username"`     
    Email            string    `json:"email"`       
    PasswordHash     string    `json:"-"`         
    ProfilePicture   *string   `json:"profile_picture,omitempty"` 
    FirstName        string    `json:"first_name"`
    LastName         string    `json:"last_name"`
    Age              int       `json:"age"`
    Gender           *string   `json:"gender,omitempty"`  
    AccountDesc      *string   `json:"account_description,omitempty"`
    CreatedAt        time.Time `json:"created_at"`
}

type Session struct {
    SessionID string    `json:"session_id"`
    UserID    int64     `json:"user_id"`
    Username  string    `json:"username"`
    ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

type PasswordReset struct {
    ResetID   int64     `json:"reset_id"`
    UserID    int64     `json:"user_id"`
    TokenHash string    `json:"-"`           
    ExpiresAt time.Time `json:"expires_at"`
}

type Post struct {
    PostID    int64     `json:"post_id"`
    UserID    int64     `json:"user_id"`
    Title     string    `json:"title"`
    Content   string    `json:"content"`
    Image     *string   `json:"image,omitempty"` 
    CreatedAt time.Time `json:"created_at"`
}

type Comment struct {
    CommentID int64     `json:"comment_id"`
    PostID    int64     `json:"post_id"`
    UserID    int64     `json:"user_id"`
    Content   string    `json:"content"`
    CreatedAt time.Time `json:"created_at"`
    ParentID  *int64    `json:"parent_id,omitempty"` 
}

type Category struct {
    CategoryID int64  `json:"category_id"`
    Name       string `json:"name"`
}

type Reaction struct {
    ReactionID int64     `json:"reaction_id"`
    UserID     int64     `json:"user_id"`
    PostID     *int64    `json:"post_id,omitempty"`    
    CommentID  *int64    `json:"comment_id,omitempty"` 
    Type       string    `json:"type"`                 
    CreatedAt  time.Time `json:"created_at"`
}

type PrivateMessage struct {
    MessageID   int64     `json:"message_id"`
    SenderID    int64     `json:"sender_id"`
    ReceiverID  int64     `json:"receiver_id"`
    Content     string    `json:"content"`
    Timestamp   time.Time `json:"timestamp"`
    IsDelivered bool      `json:"is_delivered"`
    IsRead      bool      `json:"is_read"`
}

type MessageStatus struct {
    StatusID    int64      `json:"status_id"`
    MessageID   int64      `json:"message_id"`
    IsDelivered bool       `json:"is_delivered"`
    IsRead      bool       `json:"is_read"`
    ReadAt      *time.Time `json:"read_at,omitempty"`
}
