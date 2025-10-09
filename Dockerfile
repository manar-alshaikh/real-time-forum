# Use the official Golang image
FROM golang:1.20-alpine

# Install necessary dependencies, including SQLite3
RUN apk update && apk add --no-cache \
    sqlite sqlite-dev \
    build-base \
    && rm -rf /var/cache/apk/*

# Set up the working directory
WORKDIR /app

# Copy the Go source code into the container
COPY . .

# Install Go dependencies
RUN go mod tidy

# Build the Go application
RUN go build -o app .

# Expose the app's port
EXPOSE 8080

# Run the application
CMD ["./app"]
