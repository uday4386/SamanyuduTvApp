# Use official Node.js image with Puppeteer support
FROM ghcr.io/puppeteer/puppeteer:latest

USER root

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Set environment variables
ENV PORT=5000

# Expose the port
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
