package models

import (
	"database/sql"
	"log"
	"os"
	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func InitDB(path string) *sql.DB {
	var err error
	DB, err = sql.Open("sqlite3", path)
	if err != nil {
		log.Fatal("Failed to open DB:", err)
	}
	schema, err := os.ReadFile("database/schema.sql")
	if err != nil {
		log.Fatal("Failed to read schema:", err)
	}
	if _, err := DB.Exec(string(schema)); err != nil {
		log.Fatal("Failed to apply schema:", err)
	}
	log.Println("Database connected and schema applied")
	DB.SetMaxOpenConns(1) 
	return DB
}